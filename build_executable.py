#!/usr/bin/env python3
"""
Build script for creating standalone PaddleOCR executables
Supports Windows, macOS, and Linux platforms
"""

import os
import sys
import shutil
import subprocess
import platform
import argparse
from pathlib import Path

class ExecutableBuilder:
    def __init__(self):
        self.project_root = Path(__file__).parent
        self.python_backend = self.project_root / "python_backend"
        self.dist_dir = self.project_root / "dist"
        self.build_dir = self.project_root / "build"
        
        # Platform-specific settings
        self.platform = platform.system().lower()
        self.arch = platform.machine().lower()
        
        # Executable names
        self.exe_name = self.get_executable_name()
        
    def get_executable_name(self):
        """Get platform-specific executable name"""
        base_name = "paddleocr_service"
        if self.platform == "windows":
            return f"{base_name}.exe"
        else:
            return base_name
    
    def check_dependencies(self):
        """Check if all required dependencies are installed"""
        print("🔍 Checking dependencies...")
        
        required_packages = [
            'pyinstaller',
            'paddleocr',
            'opencv-python',
            'fastapi',
            'uvicorn',
            'pydantic',
            'pillow',
            'numpy',
            'python-Levenshtein',
            'psutil',
            'aiofiles',
            'python-multipart',
            # Document processing dependencies
            'pypdfium2',
            'docx2txt',
            'python-docx',
            'striprtf'
        ]
        
        missing_packages = []
        
        # Map package names to import names
        import_map = {
            'pyinstaller': 'PyInstaller',
            'paddleocr': 'paddleocr',
            'opencv-python': 'cv2',
            'fastapi': 'fastapi',
            'uvicorn': 'uvicorn',
            'pydantic': 'pydantic',
            'pillow': 'PIL',
            'numpy': 'numpy',
            'python-Levenshtein': 'Levenshtein',
            'psutil': 'psutil',
            'aiofiles': 'aiofiles',
            'python-multipart': 'multipart',
            # Document processing imports
            'pypdfium2': 'pypdfium2',
            'docx2txt': 'docx2txt',
            'python-docx': 'docx',
            'striprtf': 'striprtf'
        }

        for package in required_packages:
            try:
                import_name = import_map.get(package, package.replace('-', '_'))
                __import__(import_name)
                print(f"  ✅ {package}")
            except ImportError:
                missing_packages.append(package)
                print(f"  ❌ {package}")
        
        if missing_packages:
            print(f"\n❌ Missing packages: {', '.join(missing_packages)}")
            print("Install them with: pip install " + " ".join(missing_packages))
            return False
        
        print("✅ All dependencies are installed")
        return True
    
    def clean_build_dirs(self):
        """Clean previous build artifacts"""
        print("🧹 Cleaning build directories...")
        
        dirs_to_clean = [self.build_dir, self.dist_dir]
        
        for dir_path in dirs_to_clean:
            if dir_path.exists():
                shutil.rmtree(dir_path)
                print(f"  🗑️  Removed {dir_path}")
        
        # Clean PyInstaller cache
        pycache_dirs = list(self.project_root.rglob("__pycache__"))
        for cache_dir in pycache_dirs:
            shutil.rmtree(cache_dir, ignore_errors=True)
        
        print("✅ Build directories cleaned")
    
    def install_pyinstaller_if_needed(self):
        """Install PyInstaller if not available"""
        try:
            import PyInstaller
            print("✅ PyInstaller is available")
            return True
        except ImportError:
            print("📦 Installing PyInstaller...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
                print("✅ PyInstaller installed successfully")
                return True
            except subprocess.CalledProcessError as e:
                print(f"❌ Failed to install PyInstaller: {e}")
                return False
    
    def build_executable(self, debug=False):
        """Build the standalone executable"""
        print(f"🔨 Building executable for {self.platform} ({self.arch})...")
        
        # Change to python_backend directory
        original_cwd = os.getcwd()
        os.chdir(self.python_backend)
        
        try:
            # PyInstaller command
            cmd = [
                sys.executable, "-m", "PyInstaller",
                "--clean",
                "--noconfirm",
                "paddleocr_service.spec"
            ]
            
            if debug:
                cmd.extend(["--debug", "all"])
            
            print(f"Running: {' '.join(cmd)}")
            
            # Run PyInstaller
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                print("✅ Executable built successfully")
                
                # Move executable to project dist directory
                source_exe = self.python_backend / "dist" / self.exe_name
                target_dir = self.dist_dir / f"{self.platform}_{self.arch}"
                target_dir.mkdir(parents=True, exist_ok=True)
                target_exe = target_dir / self.exe_name
                
                if source_exe.exists():
                    shutil.move(str(source_exe), str(target_exe))
                    print(f"📦 Executable moved to: {target_exe}")
                    
                    # Make executable on Unix systems
                    if self.platform != "windows":
                        os.chmod(target_exe, 0o755)
                    
                    return target_exe
                else:
                    print(f"❌ Executable not found at: {source_exe}")
                    return None
            else:
                print(f"❌ Build failed with return code: {result.returncode}")
                print("STDOUT:", result.stdout)
                print("STDERR:", result.stderr)
                return None
                
        finally:
            os.chdir(original_cwd)
    
    def test_executable(self, exe_path):
        """Test the built executable"""
        print(f"🧪 Testing executable: {exe_path}")
        
        if not exe_path or not exe_path.exists():
            print("❌ Executable not found")
            return False
        
        try:
            # Test if executable runs and responds to --help
            result = subprocess.run([str(exe_path), "--help"], 
                                  capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                print("✅ Executable runs successfully")
                return True
            else:
                print(f"❌ Executable failed with return code: {result.returncode}")
                print("STDERR:", result.stderr)
                return False
                
        except subprocess.TimeoutExpired:
            print("❌ Executable test timed out")
            return False
        except Exception as e:
            print(f"❌ Error testing executable: {e}")
            return False
    
    def create_bundle_info(self, exe_path):
        """Create bundle information file"""
        if not exe_path or not exe_path.exists():
            return
        
        info = {
            "platform": self.platform,
            "architecture": self.arch,
            "executable": self.exe_name,
            "size_mb": round(exe_path.stat().st_size / (1024 * 1024), 2),
            "build_date": str(subprocess.check_output(["date"], text=True).strip()),
            "python_version": sys.version,
        }
        
        info_file = exe_path.parent / "bundle_info.json"
        with open(info_file, 'w') as f:
            import json
            json.dump(info, f, indent=2)
        
        print(f"📋 Bundle info saved to: {info_file}")
    
    def build(self, debug=False, test=True):
        """Main build process"""
        print(f"🚀 Building PaddleOCR Service Executable")
        print(f"Platform: {self.platform} ({self.arch})")
        print("=" * 50)
        
        # Check dependencies
        if not self.check_dependencies():
            return False
        
        # Install PyInstaller if needed
        if not self.install_pyinstaller_if_needed():
            return False
        
        # Clean build directories
        self.clean_build_dirs()
        
        # Build executable
        exe_path = self.build_executable(debug=debug)
        
        if exe_path:
            # Test executable
            if test and not self.test_executable(exe_path):
                print("⚠️  Executable built but failed tests")
            
            # Create bundle info
            self.create_bundle_info(exe_path)
            
            print("\n🎉 Build completed successfully!")
            print(f"📦 Executable: {exe_path}")
            print(f"📊 Size: {exe_path.stat().st_size / (1024 * 1024):.1f} MB")
            
            return True
        else:
            print("\n❌ Build failed")
            return False

def main():
    parser = argparse.ArgumentParser(description="Build PaddleOCR Service Executable")
    parser.add_argument("--debug", action="store_true", help="Build with debug information")
    parser.add_argument("--no-test", action="store_true", help="Skip executable testing")
    parser.add_argument("--clean-only", action="store_true", help="Only clean build directories")
    
    args = parser.parse_args()
    
    builder = ExecutableBuilder()
    
    if args.clean_only:
        builder.clean_build_dirs()
        return
    
    success = builder.build(debug=args.debug, test=not args.no_test)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
