"""Live FastAPI route smoke without credentials, Postgres or outbound source calls."""
import os
import sys
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL','postgresql://postgres:postgres@127.0.0.1:5432/eplan_test')
os.environ.setdefault('TRAINER_EMAIL','ci@example.com')
os.environ.setdefault('TRAINER_PASSWORD','Test-Only-Not-For-Production-2026')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app as e
from fastapi.testclient import TestClient

client=TestClient(e.app)
for path in ('/api/foods/search?q=гречка', '/api/foods/preview?q=гречка', '/api/foods/local-catalog'):
    result=client.get(path)
    assert result.status_code==401, f'{path}: unauthenticated request returned {result.status_code}'

# Bypass identity only for this isolated in-memory smoke; production dependencies are unchanged.
e.app.dependency_overrides[e.api_session_boundary]=lambda: None
e.app.dependency_overrides[e.require_food_search_access]=lambda: None
try:
    with patch.object(e,'_off_search',return_value=[]), patch.object(e,'_usda_search',return_value=[]), patch.object(e,'_off_barcode',return_value=[]):
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
