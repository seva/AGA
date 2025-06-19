# AGA Local Agent Installation Instructions

## Prerequisites
- **Python 3.9+** (recommended: latest Python 3.x)

## Prerequisite Installation

### Python 3.9+
- Download and install from [python.org](https://www.python.org/downloads/).
- **Windows users:** You can also install Python directly from the Microsoft Store (search for "Python" in the Microsoft Store app).
- On Windows, check "Add Python to PATH" during installation (not needed for Microsoft Store installs).
- Verify installation:
  ```sh
  python --version
  ```

### pip (Python package manager)
- pip is included with recent Python versions.
- To upgrade pip:
  ```sh
  python -m pip install --upgrade pip
  ```
- Verify installation:
  ```sh
  pip --version
  ```

## 1. Clone or Download the Repository

```
git clone https://github.com/sevangelatos/agentic-gemini-augmentation.git
cd agentic-gemini-augmentation
```
Or download and extract the ZIP, then open the folder in your terminal.

## 2. Install Python Dependencies

AGA Local Agent requires the following Python packages:
- fastapi
- uvicorn[standard]
- pydantic

You may also need:
- pyautogui (for automation features)
- pillow (for screenshots)
- pywin32 (for clipboard on Windows)

Install all dependencies:

```
pip install fastapi "uvicorn[standard]" pydantic pyautogui pillow pywin32
```

## 3. Start the Local Agent

From the `AGA` directory, run:

```
python local_agent.py
```

The server will start on [http://127.0.0.1:3000](http://127.0.0.1:3000)

## 4. Install the Browser-Side Controller

- Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
- Add the `browser_controller.user.js` script from this repo.
- The script's `@downloadURL` and `@updateURL` should point to `http://localhost:3000/browser_controller.user.js`.

## 5. Test the Setup

- Open your browser to the supported LLM UI (**currently only Gemini Web UI is implemented**).
- Feed the LLM with the contents of `Readme.md` and `Saved Prompt.md` from this directory for best results and full context.
- Interact with the AGA system as described in the README and test instructions.

## Troubleshooting
- Ensure all dependencies are installed and up to date.
- Check the terminal for error messages from the Local Agent.
- If you encounter permission issues, try running your terminal as administrator.
- For Windows automation, ensure you have the required permissions and dependencies (pywin32, pyautogui).

## Uninstallation
- To remove, simply delete the repo folder and remove the Tampermonkey script from your browser.

---
For more details, see `README.md`, `Saved Prompt.md`, and `Test Instructions for Agent.md` in this directory.
