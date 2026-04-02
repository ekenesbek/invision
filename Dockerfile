# All-in-one: backend + pre-built frontend (ML model mounted as volume)
FROM python:3.11-slim

WORKDIR /app

# Base dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt uvicorn

# ML dependencies (torch + transformers)
COPY backend/requirements-ml.txt .
RUN pip install --no-cache-dir -r requirements-ml.txt

# Application code + frontend static files
COPY backend/app ./app
COPY frontend/dist ./static

# ML model is NOT baked into the image — mount as volume:
#   -v ./ml/model:/app/ml/model
# This separates ~268MB model from the app build

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
