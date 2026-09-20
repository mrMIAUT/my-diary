from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
app=FastAPI(title="Зроби себе зі мною")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_methods=["*"],allow_headers=["*"])
@app.get("/")
def root(): return {"service":"Зроби себе зі мною","status":"online"}
@app.get("/health")
def health(): return {"ok":True}
