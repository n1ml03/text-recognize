# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for PaddleOCR Service
Creates a standalone executable with all dependencies bundled
"""

import os
import sys
from pathlib import Path

# Get the directory containing this spec file
spec_dir = Path(SPECPATH)
main_script = spec_dir / 'main.py'

# Define data files and hidden imports
block_cipher = None

# Hidden imports required for PaddleOCR and dependencies
hidden_imports = [
    'paddleocr',
    'paddle',
    'paddlepaddle',
    'cv2',
    'numpy',
    'PIL',
    'PIL.Image',
    'PIL.ImageDraw',
    'PIL.ImageFont',
    'fastapi',
    'uvicorn',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'pydantic',
    'pydantic.fields',
    'pydantic.main',
    'pydantic.types',
    'starlette',
    'starlette.applications',
    'starlette.middleware',
    'starlette.middleware.cors',
    'starlette.responses',
    'starlette.routing',
    'Levenshtein',
    'psutil',
    'aiofiles',
    'multipart',
    'python_multipart',
    'email.mime',
    'email.mime.multipart',
    'email.mime.text',
    'email.mime.base',
    'json',
    'tempfile',
    'shutil',
    'gc',
    'difflib',
    'logging',
    'asyncio',
    'datetime',
    'pathlib',
    'typing',
    'concurrent.futures',
    'threading',
    'queue',
    'socket',
    'ssl',
    'urllib',
    'urllib.parse',
    'urllib.request',
    'http',
    'http.client',
    'http.server',
    # Document processing dependencies
    'pypdfium2',
    'docx2txt',
    'docx',
    'striprtf',
    'striprtf.striprtf',
    # New modular components
    'models',
    'video_processing',
    'routes',
]

# Data files to include
datas = []

# Try to find PaddleOCR model files and include them
try:
    import paddleocr
    paddle_dir = Path(paddleocr.__file__).parent
    
    # Include PaddleOCR models and resources
    model_dirs = [
        'models',
        'ppocr',
        'ppstructure',
        'tools',
    ]
    
    for model_dir in model_dirs:
        model_path = paddle_dir / model_dir
        if model_path.exists():
            datas.append((str(model_path), f'paddleocr/{model_dir}'))
            
except ImportError:
    print("Warning: PaddleOCR not found, models may not be included")

# Include OpenCV data files
try:
    import cv2
    cv2_dir = Path(cv2.__file__).parent
    cv2_data = cv2_dir / 'data'
    if cv2_data.exists():
        datas.append((str(cv2_data), 'cv2/data'))
except ImportError:
    print("Warning: OpenCV not found")

# Include any additional data files
additional_data = [
    # Add any custom data files here
]
datas.extend(additional_data)

# Binaries to exclude (let PyInstaller handle them automatically)
binaries = []

# Analysis configuration
a = Analysis(
    [str(main_script)],
    pathex=[str(spec_dir)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary modules to reduce size
        'tkinter',
        'matplotlib',
        'scipy',
        'pandas',
        'jupyter',
        'notebook',
        'IPython',
        'pytest',
        'setuptools',
        'distutils',
        'wheel',
        'pip',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# Remove duplicate entries
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# Create executable
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='paddleocr_service',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,  # Use UPX compression if available
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console for logging
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # Add icon file path if desired
)

# For macOS, create an app bundle
if sys.platform == 'darwin':
    app = BUNDLE(
        exe,
        name='PaddleOCR Service.app',
        icon=None,
        bundle_identifier='com.paddleocr.service',
        info_plist={
            'CFBundleName': 'PaddleOCR Service',
            'CFBundleDisplayName': 'PaddleOCR Service',
            'CFBundleVersion': '1.0.0',
            'CFBundleShortVersionString': '1.0.0',
            'NSHighResolutionCapable': True,
        },
    )
