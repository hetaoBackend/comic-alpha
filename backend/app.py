"""
Comic Generator Flask Application
Main entry point - registers all Blueprints
"""
import logging
from flask import Flask
from flask_cors import CORS

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Output to console
    ]
)


# Configure Flask with explicit static folder
app = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)  # Enable CORS for frontend requests

# Register blueprints
from controllers import comic_bp, image_bp, social_bp, prompt_bp, session_bp, comicbrain_bp

app.register_blueprint(comic_bp)
app.register_blueprint(image_bp)
app.register_blueprint(social_bp)
app.register_blueprint(prompt_bp)
app.register_blueprint(session_bp)
app.register_blueprint(comicbrain_bp)


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5003))
    host = os.environ.get('HOST', '127.0.0.1')
    debug = os.environ.get('FLASK_DEBUG', '').lower() in {'1', 'true', 'yes', 'on'}
    app.run(host=host, port=port, debug=debug)
