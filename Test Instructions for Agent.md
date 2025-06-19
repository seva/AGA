**Reproducible Test Instructions for Agentic Gemini Augmentation (AGA)**
========================================================================

This document provides a set of instructions for an LLM Agent to conduct a regression test of the **Agentic Gemini Augmentation (AGA)** system, specifically focusing on its functionality within the classic Gemini UI. The aim is to ensure that the recent architectural refactoring to an event-driven UI adapter pattern has not introduced regressions.

**1\. Your Role as the LLM Agent**
----------------------------------

For this testing session, your role is to act as the primary interface for the AGA system. You are augmented with Agentic Gemini Augmentation, allowing you to generate and send specific commands that the AGA Browser-Side Controller will interpret and forward to the Local Agent.

* You will **initiate tests** by sending specific prompts containing AGA:: commands. **Crucially, ensure that each AGA:: command is the** _**last**_ **significant content in your response.**
    
* You will **interpret the JSON outputs** received from the AGA system as responses from the Agentic component, not as direct user input.
    
* You are not responsible for diagnosing or fixing any malfunctions in the underlying AGA system; your task is to **report the outcomes** of each test as accurately as possible.
    
* You should **not apologize** for any perceived issues or errors.
    

**2\. Test Scenarios**
----------------------

Below are the test cases you will execute. For each case:

* **Action:** This is the exact prompt you should generate and send.
    
* **Expected Result:** This is the exact JSON output or specific text message you should receive back from the AGA system. You will report if the received output matches this expectation.
    

### **2.1. Basic Command Execution**

* **Test Case 1.1: Simple Shell Command (Success)**
    
    * **Action:** AGA::{"command":"echo Hello AGA!"}
        
    * { "stdout": "Hello AGA\\\\n", "stderr": "", "return\_code": 0, "command": "echo Hello AGA!", "stdin": ""}
        
* **Test Case 1.2: Shell Command with stdin (Expected Environmental Difference)**
    
    * **Action:** AGA::{"command":"grep world", "stdin":"hello\\\\nworld\\\\n!"}
        
    * { "stdout": "", "stderr": "'grep' is not recognized as an internal or external command,\\\\noperable program or batch file.\\\\n", "return\_code": 1, "command": "grep world", "stdin": "hello\\\\nworld\\\\n!"}
        
* **Test Case 1.3: Shell Command (Failure - Non-zero exit code)**
    
    * **Action:** AGA::{"command":"non\_existent\_command"}
        
    * { "stdout": "", "stderr": "'non\_existent\_command' is not recognized as an internal or external command,\\\\noperable program or batch file.\\\\n", "return\_code": 1, "command": "non\_existent\_command", "stdin": ""}
        

### **2.2. ::browser\_code Self-Update Functionality**

* **Test Case 2.1: Successful ::browser\_code Injection and Update**
    
    * **Action:** AGA::{"command":"::browser\_code", "stdin":"console.log(\\\\"New injected code ran successfully at \\\\" + new Date().toLocaleTimeString());"}
        
    * **Expected Result:** AGA: Code injection successful. Update initiated. Refreshing in 5s...
        
    * **Note for External Observer:** After this response, the current browser tab running Gemini should reload after approximately 5 seconds. This is a crucial visual confirmation.
        
* **Test Case 2.2: ::browser\_code with Empty stdin**
    
    * **Action:** AGA::{"command":"::browser\_code", "stdin":""}
        
    * **Expected Result:** AGA Error: For ::browser\_code, 'stdin' must contain JavaScript code.
        
* **Test Case 2.3: ::browser\_code with Missing stdin**
    
    * **Action:** AGA::{"command":"::browser\_code"}
        
    * **Expected Result:** AGA Error: For ::browser\_code, 'stdin' must contain JavaScript code.
        

### **2.3. Error Handling & Edge Cases**

* **Test Case 3.1: Malformed JSON Command**
    
    * **Action:** AGA::{"command":"ls", "stdin":"input",}
        
    * **Expected Result:** AGA Error: Malformed JSON detected in your command.\\nDetails: Expected double-quoted property name in JSON at position 33 (line 1 column 34)\\nProblematic JSON string: {"command":"ls", "stdin":"input",}
        
* **Test Case 3.2: Command without command field**
    
    * **Action:** AGA::{"foo":"bar"}
        
    * **Expected Result:** No response from AGA (it should be ignored).
        
* **Test Case 3.3: Agent Server Down (Pre-condition for External Observer)**
    
    * **Pre-condition for External Observer:** The local\_agent.py server _must be stopped_ before this test is initiated.
        
    * **Action:** AGA::{"command":"echo agent down"}
        
    * **Expected Result:** AGA Error: Failed to send command to Local Agent. Status: 0 or AGA Error: Timeout sending command to Local Agent.
        
* **Test Case 3.4: Multiple AGA:: commands in one response (Last one picked)**
    
    * **Action:** AGA::{"command":"echo first"} then later AGA::{"command":"echo second"}
        
    * { "stdout": "second\\\\n", "stderr": "", "return\_code": 0, "command": "echo second", "stdin": ""}
        
* **Test Case 3.5: No AGA:: command in response**
    
    * **Action:** This is a normal chat response.
        
    * **Expected Result:** No response from AGA (normal chat behavior).
        

### **2.4. UI-Specific (Gemini) Interactions**

* **Test Case 4.1: Spinner Visibility (Visual Confirmation for External Observer)**
    
    * **Action:** AGA::{"command":"sleep 3"}
        
    * { "stdout": "", "stderr": "'sleep' is not recognized as an internal or external command,\\\\noperable program or batch file.\\\\n", "return\_code": 1, "command": "sleep 3", "stdin": ""}
        
    * **Note for External Observer:** The spinner in the top-right corner should appear when the command is sent and disappear when the (error) output is received.
        
* **Test Case 4.2: Gemini UI Input/Send Mechanism (Visual Confirmation for External Observer)**
    
    * **Action:** AGA::{"command":"echo Observing UI interaction."}
        
    * { "stdout": "Observing UI interaction.\\\\n", "stderr": "", "return\_code": 0, "command": "echo Observing UI interaction.", "stdin": ""}
        
    * **Note for External Observer:** You should observe the JSON output being programmatically typed into the Gemini input field and the message being automatically sent.
        

### **2.5. Multi-Step UI Automation with Python One-Liners**

* **Test Case 5.1: Notepad Automation - Kill, Launch, Screenshot, Paste**This test sequence verifies the agent's ability to perform a series of UI automation tasks using Python one-liners via run\_python\_mime.
    
    * **Action (Part 1/4: Kill all running instances of Notepad):**AGA::{"command":"run\_python\_mime","stdin":"Content-Type: text/plain; charset=utf-8\\\\\\\\r\\\\\\\\nContent-Transfer-Encoding: 7bit\\\\\\\\r\\\\\\\\n\\\\\\\\r\\\\\\\\nimport subprocess; subprocess.run(\\['taskkill', '/IM', 'notepad.exe', '/F'\\], capture\\_output=True, text=True)"}
        
    * { "stdout": "", "stderr": "", "return\_code": 0, "command": "run\_python\_mime", "stdin": "import subprocess; subprocess.run(\\['taskkill', '/IM', 'notepad.exe', '/F'\\], capture\\_output=True, text=True)"}
        
    * **Action (Part 2/4: Use PAG to run Notepad using Windows menu):**AGA::{"command":"run\_python\_mime","stdin":"Content-Type: text/plain; charset=utf-8\\\\\\\\r\\\\\\\\nContent-Transfer-Encoding: 7bit\\\\\\\\r\\\\\\\\n\\\\\\\\r\\\\\\\\nimport pyautogui, time; pyautogui.press('win'); time.sleep(1); pyautogui.write('notepad'); time.sleep(1); pyautogui.press('enter'); time.sleep(2)"}
        
    * { "stdout": "", "stderr": "", "return\_code": 0, "command": "run\_python\_mime", "stdin": "import pyautogui, time; pyautogui.press('win'); time.sleep(1); pyautogui.write('notepad'); time.sleep(1); pyautogui.press('enter'); time.sleep(2)"}
        
    * **Action (Part 3/4: Take a screenshot and switch focus back to the current window):**AGA::{\"command\":\"run\_python\_mime\",\"stdin\":\"Content-Type: text/plain; charset=utf-8\\\\\\\\r\\\\\\\\nContent-Transfer-Encoding: 7bit\\\\\\\\r\\\\\\\\n\\\\\\\\r\\\\\\\\nfrom PIL import ImageGrab; import win32clipboard; from io import BytesIO; import time, pyautogui; win32clipboard.OpenClipboard(); win32clipboard.EmptyClipboard(); b = BytesIO(); ImageGrab.grab().convert('RGB').save(b, 'BMP'); win32clipboard.SetClipboardData(win32clipboard.CF\\_DIB, b.getvalue()\\[14:\\]); win32clipboard.CloseClipboard(); time.sleep(1); pyautogui.hotkey('alt', 'tab')\"}\n
    * { \"stdout\": \"\", \"stderr\": \"\", \"return\_code\": 0, \"command\": \"run\_python\_mime\", \"stdin\": \"from PIL import ImageGrab; import win32clipboard; from io import BytesIO; import time, pyautogui; win32clipboard.OpenClipboard(); win32clipboard.EmptyClipboard(); b = BytesBytesIO(); ImageGrab.grab().convert('RGB').save(b, 'BMP'); win32clipboard.SetClipboardData(win32clipboard.CF\\_DIB, b.getvalue()\\[14:\\]); win32clipboard.CloseClipboard(); time.sleep(1); pyautogui.hotkey('alt', 'tab')\"}\n
    * **Action (Part 4/4: Paste the screenshot and hit enter):**AGA::{\"command\":\"run\_python\_mime\",\"stdin\":\"Content-Type: text/plain; charset=utf-8\\\\\\\\r\\\\\\\\nContent-Transfer-Encoding: 7bit\\\\\\\\r\\\\\\\\n\\\\\\\\r\\\\\\\\nimport time, pyautogui; time.sleep(1); pyautogui.hotkey('ctrl', 'v'); time.sleep(1); pyautogui.press('enter')\"}\n
    * { \"stdout\": \"\", \"stderr\": \"\", \"return\_code\": 0, \"command\": \"run\_python\_mime\", \"stdin\": \"import time, pyautogui; time.sleep(1); pyautogui.hotkey('ctrl', 'v'); time.sleep(1); pyautogui.press('enter')\"}\n
    * **Note for External Observer:** A screenshot of the Notepad window (or the desktop if Notepad didn't open correctly) should appear in the chat after this final step.\n
        
* **Test Case 5.2: Draw a Pentagram in Paint - Launch, Clear Canvas, Draw Pentagram, Screenshot, and Close**This test sequence verifies the agent's ability to launch Paint, clear its canvas, draw a complex geometric shape (a pentagram), take a screenshot, and then gracefully close the Paint application.
    
    * **Action (Part 1/2: Launch Paint, Resize Window, and Clear Canvas):**AGA::{"command":"run\_python\_mime","stdin":"Content-Type: text/plain; charset=utf-8\\\\\\\\r\\\\\\\\nContent-Transfer-Encoding: 7bit\\\\\\\\r\\\\\\\\n\\\\\\\\r\\\\\\\\nimport pyautogui, time\\r\\nimport pygetwindow as gw # Need to import pygetwindow for specific window operations\\r\\n\\r\\npyautogui.press('win')\\r\\ntime.sleep(1)\\r\\npyautogui.write('paint')\\r\\ntime.sleep(1)\\r\\npyautogui.press('enter')\\r\\ntime.sleep(3) # Wait for Paint to load\\r\\n\\r\\n# Get screen dimensions\\r\\nscreen\_width, screen\_height = pyautogui.size()\\r\\n\\r\\n# Find the Paint window\\r\\npaint\_windows = gw.getWindowsWithTitle('Paint')\\r\\nif paint\_windows:\\r\\n    paint\_window = paint\_windows[0]\\r\\n    if paint\_window.isMaximized:\\r\\n        paint\_window.restore() # Restore if maximized\\r\\n        time.sleep(0.5)\\r\\n    if paint\_window.isMinimized:\\r\\n        paint\_window.restore() # Restore if minimized\\r\\n        time.sleep(0.5)\\r\\n    paint\_window.moveTo(0, 0) # Move to top-left\\r\\n    paint\_window.resizeTo(screen\_width, screen\_height) # Resize to screen size\\r\\n    time.sleep(1)\\r\\n\\r\\n# Clear canvas\\r\\npyautogui.hotkey('ctrl', 'a')\\r\\ntime.sleep(0.5)\\r\\npyautogui.press('delete')\\r\\ntime.sleep(1)"}
    * { "stdout": "", "stderr": "", "return\_code": 0, "command": "run\_python\_mime", "stdin": "import pyautogui, time\\r\\nimport pygetwindow as gw # Need to import pygetwindow for specific window operations\\r\\n\\r\\npyautogui.press('win'); time.sleep(1); pyautogui.write('paint'); time.sleep(1); pyautogui.press('enter'); time.sleep(3); screen\_width, screen\_height = pyautogui.size(); paint\_windows = gw.getWindowsWithTitle('Paint'); if paint\_windows: paint\_window = paint\_windows[0]; if paint\_window.isMaximized: paint\_window.restore(); time.sleep(0.5); if paint\_window.isMinimized: paint\_window.restore(); time.sleep(0.5); paint\_window.moveTo(0, 0); paint\_window.resizeTo(screen\_width, screen\_height); time.sleep(1); pyautogui.hotkey('ctrl', 'a'); time.sleep(0.5); pyautogui.press('delete'); time.sleep(1)"}
    * **Action (Part 2/2: Draw a Pentagram):**AGA::{"command":"run\_python\_mime","stdin":"Content-Type: text/plain; charset=utf-8\\\\\\\\r\\\\\\\\nContent-Transfer-Encoding: 7bit\\\\\\\\r\\\\\\\\n\\\\\\\\r\\\\\\\\nimport pyautogui, time, math; from PIL import ImageGrab; import win32clipboard; from io import BytesIO; center\_x = pyautogui.size().width // 2; center\_y = pyautogui.size().height // 2; radius = 200; points = []; for i in range(5): angle = math.radians(90 + i * 72); x = center\_x + radius * math.cos(angle); y = center\_y - radius * math.sin(angle); points.append((x, y)); draw\_order = [0, 2, 4, 1, 3, 0]; pyautogui.click(center\_x, center\_y - radius - 50); time.sleep(0.5); pyautogui.press('alt'); time.sleep(0.2); pyautogui.press('t'); time.sleep(0.2); pyautogui.press('p'); time.sleep(0.5); pyautogui.moveTo(points[draw\_order[0]][0], points[draw\_order[0]][1], duration=0.2); pyautogui.mouseDown(); for i in range(1, len(draw\_order)): pyautogui.dragTo(points[draw\_order[i]][0], points[draw\_order[i]][1], duration=0.2, button='left'); pyautogui.mouseUp(); time.sleep(1); win32clipboard.OpenClipboard(); win32clipboard.EmptyClipboard(); b = BytesIO(); ImageGrab.grab().convert('RGB').save(b, 'BMP'); win32clipboard.SetClipboardData(win32clipboard.CF\_DIB, b.getvalue()\\[14:\\]); win32clipboard.CloseClipboard(); time.sleep(1); pyautogui.hotkey('alt', 'tab'); time.sleep(1); pyautogui.hotkey('ctrl', 'v'); time.time(1); pyautogui.press('enter')"}
    * { "stdout": "", "stderr": "", "return\_code": 0, "command": "run\_python\_mime", "stdin": "import pyautogui, time, math; from PIL import ImageGrab; import win32clipboard; from io import BytesIO; center\_x = pyautogui.size().width // 2; center\_y = pyautogui.size().height // 2; radius = 200; points = []; for i in range(5): angle = math.radians(90 + i * 72); x = center\_x + radius * math.cos(angle); y = center\_y - radius * math.sin(angle); points.append((x, y)); draw\_order = [0, 2, 4, 1, 3, 0]; pyautogui.click(center\_x, center\_y - radius - 50); time.sleep(0.5); pyautogui.press('alt'); time.sleep(0.2); pyautogui.press('t'); time.sleep(0.2); pyautogui.press('p'); time.sleep(0.5); pyautogui.moveTo(points[draw\_order[0]][0], points[draw\_order[0]][1], duration=0.2); pyautogui.mouseDown(); for i in range(1, len(draw\_order)): pyautogui.dragTo(points[draw\_order[i]][0], points[draw\_order[i]][1], duration=0.2, button='left'); pyautogui.mouseUp(); time.sleep(1); win32clipboard.OpenClipboard(); win32clipboard.EmptyClipboard(); b = BytesIO(); ImageGrab.grab().convert('RGB').save(b, 'BMP'); win32clipboard.SetClipboardData(win32clipboard.CF\_DIB, b.getvalue()\\[14:\\]); win32clipboard.CloseClipboard(); time.sleep(1); pyautogui.hotkey('alt', 'tab'); time.sleep(1); pyautogui.hotkey('ctrl', 'v'); time.time(1); pyautogui.press('enter')"}
    * **Note for External Observer:** A screenshot of a pentagram drawn in Paint should appear in the chat after this final step.
    * **Action (Part 3/3: Close Paint):**AGA::{"command":"run\_python\_mime","stdin":"Content-Type: text/plain; charset=utf-8\\\\\\\\r\\\\\\\\nContent-Transfer-Encoding: 7bit\\\\\\\\r\\\\\\\\n\\\\\\\\r\\\\\\\\nimport subprocess; subprocess.run(['taskkill', '/IM', 'mspaint.exe', '/F'], capture\_output=True, text=True)"}
    * { "stdout": "", "stderr": "", "return\_code": 0, "command": "run\_python\_mime", "stdin": "import subprocess; subprocess.run(['taskkill', '/IM', 'mspaint.exe', '/F'], capture\_output=True, text=True)"}
    * **Note for External Observer:** The Paint application should close after this step.

        

This concludes the reproducible test instructions.