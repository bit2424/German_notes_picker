FROM python:3.13-slim AS backend

WORKDIR /app

RUN pip install --no-cache-dir poetry && \
    poetry config virtualenvs.create false

COPY pyproject.toml poetry.lock ./
RUN poetry install --no-interaction --no-ansi --only main --no-root

COPY german_notes/ german_notes/

EXPOSE 8001

CMD ["uvicorn", "german_notes.api.main:app", "--host", "0.0.0.0", "--port", "8001"]
