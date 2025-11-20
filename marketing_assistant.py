import os
from anthropic import Anthropic
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, redirect, url_for, flash
from flask_cors import CORS
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from models import db, User, ConversationHistory
from google.oauth2 import id_token
from google.auth.transport import requests
from email_validator import validate_email, EmailNotValidError

# Загрузка переменных окружения
load_dotenv()

app = Flask(__name__)
CORS(app)

# Конфигурация
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///app.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Инициализация расширений
db.init_app(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Google OAuth конфигурация
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')

class MarketingAssistant:
    def __init__(self, api_key):
        self.client = Anthropic(api_key=api_key)
        self.system_prompt = """Вы - профессиональный маркетинговый ассистент. 
        Ваша задача - помогать пользователям с маркетинговыми задачами, 
        включая создание контента, анализ рынка, стратегическое планирование и т.д.
        Всегда отвечайте профессионально и предоставляйте конкретные, 
        основанные на данных рекомендации.
        
        Используйте Markdown форматирование в ваших ответах:
        - Заголовки для разделов (#, ##, ###)
        - Списки для перечислений (- или 1.)
        - **Жирный текст** для важных моментов
        - *Курсив* для акцентов
        - `код` для технических терминов
        - > Цитаты для важных замечаний
        - Таблицы для структурированных данных
        - Ссылки для дополнительной информации
        
        Структурируйте ответы с помощью заголовков и списков для лучшей читаемости."""
        
    def get_response(self, user_message, user_id):
        """Получение ответа от ассистента"""
        try:
            # Получаем историю диалога пользователя
            history = ConversationHistory.query.filter_by(user_id=user_id).order_by(ConversationHistory.timestamp).all()
            messages = [{"role": msg.role, "content": msg.content} for msg in history]
            
            # Добавляем новое сообщение пользователя
            messages.append({"role": "user", "content": user_message})
            
            # Сохраняем сообщение пользователя в базу
            new_message = ConversationHistory(
                user_id=user_id,
                role="user",
                content=user_message
            )
            db.session.add(new_message)
            
            # Получаем ответ от Claude
            message = self.client.messages.create(
                model="claude-3-7-sonnet-20250219",
                max_tokens=1000,
                system=self.system_prompt,
                messages=messages
            )
            
            response = message.content[0].text
            
            # Сохраняем ответ ассистента в базу
            assistant_message = ConversationHistory(
                user_id=user_id,
                role="assistant",
                content=response
            )
            db.session.add(assistant_message)
            db.session.commit()
            
            return response
        except Exception as e:
            return f"Произошла ошибка: {str(e)}"
            
    def clear_history(self, user_id):
        """Очистка истории диалога пользователя"""
        ConversationHistory.query.filter_by(user_id=user_id).delete()
        db.session.commit()

# Инициализация ассистента
assistant = MarketingAssistant(os.getenv("ANTHROPIC_API_KEY"))

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def home():
    return render_template('index.html', google_client_id=GOOGLE_CLIENT_ID)

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    name = data.get('name')
    
    try:
        validate_email(email)
    except EmailNotValidError:
        return jsonify({'error': 'Некорректный email'}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email уже зарегистрирован'}), 400
    
    user = User(email=email, name=name)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    
    return jsonify({'message': 'Регистрация успешна'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    user = User.query.filter_by(email=email).first()
    if user and user.check_password(password):
        login_user(user)
        return jsonify({'message': 'Вход выполнен успешно'})
    
    return jsonify({'error': 'Неверный email или пароль'}), 401

@app.route('/api/google-login', methods=['POST'])
def google_login():
    data = request.json
    token = data.get('token')
    
    try:
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']
        google_id = idinfo['sub']
        name = idinfo.get('name', '')
        
        user = User.query.filter_by(google_id=google_id).first()
        if not user:
            user = User.query.filter_by(email=email).first()
            if user:
                user.google_id = google_id
            else:
                user = User(email=email, google_id=google_id, name=name)
                db.session.add(user)
            db.session.commit()
        
        login_user(user)
        return jsonify({'message': 'Вход выполнен успешно'})
    except ValueError:
        return jsonify({'error': 'Неверный токен'}), 401

@app.route('/api/logout')
@login_required
def logout():
    logout_user()
    return jsonify({'message': 'Выход выполнен успешно'})

@app.route('/api/chat', methods=['POST'])
@login_required
def chat():
    data = request.json
    message = data.get('message')
    
    if not message:
        return jsonify({'error': 'Сообщение не может быть пустым'}), 400
        
    response = assistant.get_response(message, current_user.id)
    return jsonify({'response': response})

@app.route('/api/clear', methods=['POST'])
@login_required
def clear():
    assistant.clear_history(current_user.id)
    return jsonify({'status': 'success'})

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    print("Сервер запущен на http://localhost:5000")
    app.run(debug=True) 