FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt uvicorn

COPY app ./app

# ML model for AI detection
COPY ../ml/model/InVisionEssayDetector ./ml/model/InVisionEssayDetector

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
