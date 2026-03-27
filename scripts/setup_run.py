import subprocess
import sys
import os

def install_requirements():
    print("=" * 50)
    print("Checking dependencies...")
    print("=" * 50)

    packages = [
        ("blinker",      "blinker==1.9.0",      "blinker==1.9.0"),
        ("click",        "click==8.3.1",         "click==8.3.1"),
        ("colorama",     "colorama==0.4.6",      "colorama==0.4.6"),
        ("flask",        "Flask==3.1.3",         "Flask==3.1.3"),
        ("itsdangerous", "itsdangerous==2.2.0",  "itsdangerous==2.2.0"),
        ("jinja2",       "Jinja2==3.1.6",        "Jinja2==3.1.6"),
        ("markupsafe",   "MarkupSafe==3.0.3",    "MarkupSafe==3.0.3"),
        ("werkzeug",     "Werkzeug==3.1.6",      "Werkzeug==3.1.6"),
    ]

    all_ok = True
    for import_name, pip_name, display_name in packages:
        try:
            __import__(import_name)
            print(f"  ✓ {display_name}")
        except ImportError:
            print(f"  ✗ {display_name} missing — installing...", end=" ", flush=True)
            try:
                subprocess.check_call(
                    [sys.executable, "-m", "pip", "install", pip_name],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                print("✓ Installed!")
            except Exception as e:
                print(f"✗ Failed! ({e})")
                all_ok = False

    print("=" * 50)
    if all_ok:
        print("✅ All dependencies ready!")
    else:
        print("⚠️  Some packages failed. Try manually:")
        print("    pip install -r requirements.txt")
    print("=" * 50)


    return all_ok


if __name__ == "__main__":
    if install_requirements():

        try:
            input("\n  Press ENTER to start the app...")
            print("\nStarting app...\n")
            subprocess.run([sys.executable, "RunApp.py"])
        except KeyboardInterrupt:
            print("\n  Cancelled by user. To start the app manually, run:")
            print("    python RunApp.py\n")
            