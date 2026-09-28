"""Build standalone executable with PyInstaller."""
import PyInstaller.__main__

EXCLUDES = [
    "PyQt5", "PySide2", "PyQt6", "PySide6",
    "tkinter", "_tkinter",
    "numpy", "pandas", "matplotlib", "scipy",
    "PIL", "cv2", "torch", "tensorflow",
    "jupyter", "notebook", "IPython",
    "zmq", "tornado",
    "sphinx", "docutils",
]

PyInstaller.__main__.run([
    "snh/main.py",
    "--name=snh",
    "--onefile",
    "--clean",
    "--noconfirm",
    *[f"--exclude={mod}" for mod in EXCLUDES],
])
