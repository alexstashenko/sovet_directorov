from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from marketing_assistant import MarketingAssistant
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

app = Flask(__name__)
CORS(app)

# Инициализируем ассистента
assistant = MarketingAssistant(os.getenv("ANTHROPIC_API_KEY"))

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({'error': 'Сообщение не может быть пустым'}), 400
    
    try:
        response = assistant.get_response(user_message)
        return jsonify({'response': response})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clear', methods=['POST'])
def clear_history():
    try:
        assistant.clear_history()
        return jsonify({'message': 'История диалога очищена'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True) 