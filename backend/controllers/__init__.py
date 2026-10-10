# Controllers package
from .comic_controller import comic_bp
from .image_controller import image_bp
from .social_media_controller import social_bp
from .prompt_controller import prompt_bp
from .session_controller import session_bp
from .comicbrain_controller import comicbrain_bp

__all__ = [
    'comic_bp',
    'image_bp',
    'social_bp',
    'prompt_bp',
    'session_bp',
    'comicbrain_bp',
]
