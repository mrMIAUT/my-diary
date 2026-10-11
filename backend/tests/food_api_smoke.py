"""Live FastAPI route smoke without credentials, Postgres or outbound source calls."""
import os
import sys
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL','postgresql://postgres:postgres@127.0.0.1:5432/eplan_test')
os.environ.setdefault('TRAINER_EMAIL','ci@example.com')
os.environ.setdefault('TRAINER_PASSWORD','Test-Only-Not-For-Production-2026')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import ast
import types

# Import the *real production routes* but skip the single module-level init()
# call, which performs persistent database migrations on every app launch.
# No database, credentials or network connection is available in CI.
source_path=Path(__file__).resolve().parents[1]/'app.py'
tree=ast.parse(source_path.read_text(encoding='utf-8'),filename=str(source_path))
nodes=[node for node in tree.body if isinstance(node,ast.Expr) and isinstance(node.value,ast.Call)
       and isinstance(node.value.func,ast.Name) and node.value.func.id=='init']
assert len(nodes)==1, 'Expected exactly one production startup init() call'
tree.body=[node for node in tree.body if node not in nodes]
e=types.ModuleType('eplan_food_api_smoke_module')
e.__file__=str(source_path)
sys.modules[e.__name__]=e
exec(compile(tree,str(source_path),'exec'),e.__dict__)
from fastapi.testclient import TestClient

client=TestClient(e.app)
for path in ('/api/foods/search?q=гречка', '/api/foods/preview?q=гречка', '/api/foods/local-catalog'):
    result=client.get(path)
    assert result.status_code==401, f'{path}: unauthenticated request returned {result.status_code}'

# Bypass identity only for this isolated in-memory smoke; production dependencies are unchanged.
e.app.dependency_overrides[e.api_session_boundary]=lambda: None
e.app.dependency_overrides[e.require_food_search_access]=lambda: None
try:
    with patch.object(e,'_off_collect',return_value=[]), patch.object(e,'_usda_search',return_value=[]), patch.object(e,'_off_barcode',return_value=[]):
        response=client.get('/api/foods/search?q=гречка&limit=12&page=1')
        assert response.status_code==200, f'search failed: {response.status_code} {response.text[:300]}'
        result=response.json()
        assert isinstance(result.get('items'),list) and result['items'], 'No matching local foods'
        row=result['items'][0]
        assert 'греч' in row.get('name','').lower(), row
        for key in ('kcal_100','protein_100','fat_100','carbs_100','source','approximate'):
            assert key in row, (key,row)
        assert all(row[k]>=0 for k in ('kcal_100','protein_100','fat_100','carbs_100')), row
        assert client.get('/api/foods/search?q=а').status_code==422, 'Short query accepted'
        print('REAL FASTAPI FOOD SEARCH: AUTHENTICATION + LOCAL FALLBACK + RESPONSE: PASS')
finally:
    e.app.dependency_overrides.clear()
