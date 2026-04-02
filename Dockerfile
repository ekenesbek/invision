FROM python:3.11-slim
WORKDIR /app

# Backend dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt uvicorn

# Backend code
COPY backend/app ./app

# Pre-built frontend
COPY frontend/dist ./static

# ML model
COPY ml/model/InVisionEssayDetector ./ml/model/InVisionEssayDetector

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
