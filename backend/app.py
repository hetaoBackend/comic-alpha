"""
Comic Generator Flask Application
Main entry point - registers all Blueprints
"""
import logging
import os
from flask import Flask
from flask_cors import CORS
from runtime_paths import image_directory

# Configure logging
logging.basicConfig(
    level=logging.WARNING if os.environ.get('COMIC_STORE') == '1' else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Output to console
    ]
)


# Configure Flask with explicit static folder
app = Flask(__name__, static_folder=None)
CORS(app)  # Enable CORS for frontend requests
from store_consent import install_store_consent
install_store_consent(app)


@app.get('/static/images/<filename>')
def generated_image(filename):
    from flask import abort, send_file
    from runtime_paths import generated_image_path
    try:
        path = generated_image_path('/static/images/' + filename)
    except ValueError:
        abort(404)
    if not path.is_file():
        abort(404)
    return send_file(path)

# Register blueprints
from controllers import comic_bp, image_bp, social_bp, prompt_bp, session_bp, comicbrain_bp

app.register_blueprint(comic_bp)
app.register_blueprint(image_bp)
app.register_blueprint(social_bp)
app.register_blueprint(prompt_bp)
app.register_blueprint(session_bp)
app.register_blueprint(comicbrain_bp)
from controllers.console_controller import console_bp
app.register_blueprint(console_bp)


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5003))
    host = os.environ.get('HOST', '127.0.0.1')
    debug = os.environ.get('FLASK_DEBUG', '').lower() in {'1', 'true', 'yes', 'on'}
    app.run(host=host, port=port, debug=debug)
