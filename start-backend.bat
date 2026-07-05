@echo off
echo Starting CoopSys Django API...
python -m venv venv 2>nul
call venv\Scripts\activate
pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py setup_coopsys
python manage.py runserver
