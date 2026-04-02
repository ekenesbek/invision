#!/bin/bash
# Полный пайплайн: установка зависимостей → данные → обучение → тест

set -e

ML_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ML_DIR"

echo "=== InVision ML Pipeline ==="
echo ""

# 1. Установка зависимостей
echo "[1/3] Устанавливаем зависимости..."
pip install -r requirements.txt -q

# 2. Подготовка данных
echo ""
echo "[2/3] Загружаем и готовим датасет HC3..."
python scripts/prepare_data.py

# 3. Обучение
echo ""
echo "[3/3] Запускаем fine-tuning..."
python scripts/train.py

# 4. Быстрый тест
echo ""
echo "=== Тест инференса ==="
python scripts/infer.py

echo ""
echo "Готово! Модель сохранена в model/InVisionEssayDetector/"
