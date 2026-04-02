FROM python:3.11-slim

WORKDIR /app

# Base dependencies (lightweight)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt uvicorn

# ML dependencies (torch + transformers, ~2GB)
COPY backend/requirements-ml.txt .
RUN pip install --no-cache-dir -r requirements-ml.txt

# Application code only — ML model mounted as volume at runtime
COPY backend/app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
