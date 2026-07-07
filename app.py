import os
from flask import Flask, redirect, url_for, session, render_template, request, jsonify
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
from authlib.integrations.flask_client import OAuth

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")

# Configure Google OAuth
oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

# Database Helper
def get_db_connection():
    return psycopg2.connect(os.getenv('DATABASE_URL'))

# --- AUTHENTICATION ROUTES ---

@app.route('/')
def index():
    if 'user' in session:
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/login')
def login():
    redirect_uri = url_for('auth_callback', _external=True)
    return google.authorize_redirect(redirect_uri)

@app.route('/callback')
def auth_callback():
    token = google.authorize_access_token()
    user_info = token.get('userinfo')
    
    if user_info:
        google_id = user_info['sub']
        email = user_info['email']
        name = user_info.get('name', '')

        # Upsert user into database (Insert if new, leave alone if existing)
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO users (google_id, email, name)
            VALUES (%s, %s, %s)
            ON CONFLICT (google_id) DO NOTHING;
        """, (google_id, email, name))
        conn.commit()
        cur.close()
        conn.close()

        # Store critical user info in session
        session['user'] = {
            'google_id': google_id,
            'email': email,
            'name': name
        }
        
    return redirect(url_for('dashboard'))

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('index'))

# --- PAGE ROUTES ---

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('index'))
    
    # Fetch user configuration details for UI customization
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE google_id = %s", (session['user']['google_id'],))
    user_settings = cur.fetchone()
    cur.close()
    conn.close()
    
    return render_template('dashboard.html', user=user_settings)

@app.route('/about')
def about():
    return render_template('about.html')

# --- TASK MANAGEMENT API ENDPOINTS ---

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'Date parameters missing'}), 400
        
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT id, title, is_completed 
        FROM tasks 
        WHERE google_id = %s AND task_date = %s 
        ORDER BY id ASC
    """, (session['user']['google_id'], date_str))
    tasks = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(tasks)

@app.route('/api/tasks', methods=['POST'])
def add_task():
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        INSERT INTO tasks (google_id, task_date, title) 
        VALUES (%s, %s, %s) 
        RETURNING id, title, is_completed
    """, (session['user']['google_id'], data['date'], data['title']))
    new_task = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(new_task)

@app.route('/api/tasks/<int:task_id>/toggle', methods=['POST'])
def toggle_task(task_id):
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE tasks 
        SET is_completed = NOT is_completed 
        WHERE id = %s AND google_id = %s
    """, (task_id, session['user']['google_id']))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/tasks/<int:task_id>/edit', methods=['POST'])
def edit_task(task_id):
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE tasks 
        SET title = %s 
        WHERE id = %s AND google_id = %s
    """, (data['title'], task_id, session['user']['google_id']))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM tasks WHERE id = %s AND google_id = %s", (task_id, session['user']['google_id']))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True})

# --- CONFIGURATION API ENDPOINTS ---

@app.route('/api/settings/pomodoro', methods=['POST'])
def save_pomodoro():
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE users 
        SET pomodoro_work = %s, pomodoro_break = %s 
        WHERE google_id = %s
    """, (data['work'], data['break'], session['user']['google_id']))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/settings/theme', methods=['POST'])
def toggle_theme():
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json
    new_theme = data['theme'] # 'light' or 'dark'
    
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("UPDATE users SET theme = %s WHERE google_id = %s", (new_theme, session['user']['google_id']))
    
    # Per instructions, switching themes automatically wipes user tasks from the database
    cur.execute("DELETE FROM tasks WHERE google_id = %s", (session['user']['google_id'],))
    
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/settings/clear', methods=['POST'])
def clear_all_tasks():
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM tasks WHERE google_id = %s", (session['user']['google_id'],))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)