"""FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from german_notes.api.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_dotenv()
    yield


app = FastAPI(title="German Notes Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
