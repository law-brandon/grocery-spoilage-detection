FROM python:3.11-slim-buster AS build

RUN set -eux; \
    pip install poetry 

ENV POETRY_HOME "/opt/poetry"
ENV POETRY_VERSION "2.0.1"
RUN curl -sSL https://install.python-poetry.org | python3 - 

ENV PATH /opt/poetry/bin:${PATH}
WORKDIR /app
ENV POETRY_VIRTUALENVS_IN_PROJECT=1

COPY pyproject.toml poetry.lock ./
RUN poetry install --only main --no-root

FROM python:3.11-slim as run 

RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/.venv /app/.venv
ENV PATH /app/.venv/bin:${PATH}
COPY . .
CMD uvicorn src.main:app --host 0.0.0.0
