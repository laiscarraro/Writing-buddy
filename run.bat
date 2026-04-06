@echo off
cd /d "%~dp0"
echo Installing dependencies...
pip install fastapi uvicorn
echo Starting Writing Buddy server...
echo Open http://localhost:8000 in Chrome
echo.
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
