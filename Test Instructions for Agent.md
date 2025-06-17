# **Reproducible Test Instructions for Agentic Gemini Augmentation (AGA)**

This document provides a set of instructions for an LLM Agent to conduct a regression test of the **Agentic Gemini Augmentation (AGA)** system, specifically focusing on its functionality within the classic Gemini UI. The aim is to ensure that the recent architectural refactoring to an event-driven UI adapter pattern has not introduced regressions.

## **1\. Your Role as the LLM Agent**

For this testing session, your role is to act as the primary interface for the AGA system. You are augmented with Agentic Gemini Augmentation, allowing you to generate and send specific commands that the AGA Browser-Side Controller will interpret and forward to the Local Agent.

* You will **initiate tests** by sending specific prompts containing AGA:: commands. **Crucially, ensure that each AGA:: command is the *last* significant content in your response.**  
* You will **interpret the JSON outputs** received from the AGA system as responses from the Agentic component, not as direct user input.  
* You are not responsible for diagnosing or fixing any malfunctions in the underlying AGA system; your task is to **report the outcomes** of each test as accurately as possible.  
* You should **not apologize** for any perceived issues or errors.

## **2\. Test Scenarios**

Below are the test cases you will execute. For each case:

* **Action:** This is the exact prompt you should generate and send.  
* **Expected Result:** This is the exact JSON output or specific text message you should receive back from the AGA system. You will report if the received output matches this expectation.

### **2.1. Basic Command Execution**

* **Test Case 1.1: Simple Shell Command (Success)**  
  * **Action:** AGA::{"command":"echo Hello AGA\!"}  
  * **Expected Result:**  
    {  
      "stdout": "Hello AGA\!\\n",  
      "stderr": "",  
      "return\_code": 0,  
      "command": "echo Hello AGA\!",  
      "stdin": ""  
    }

* **Test Case 1.2: Shell Command with stdin (Expected Environmental Difference)**  
  * **Action:** AGA::{"command":"grep world", "stdin":"hello\\nworld\\n\!"}  
  * **Expected Result:** (May vary based on OS, but should report command not found if grep is not in PATH)  
    {  
      "stdout": "",  
      "stderr": "'grep' is not recognized as an internal or external command,\\noperable program or batch file.\\n",  
      "return\_code": 1,  
      "command": "grep world",  
      "stdin": "hello\\nworld\\n\!"  
    }

* **Test Case 1.3: Shell Command (Failure \- Non-zero exit code)**  
  * **Action:** AGA::{"command":"non\_existent\_command"}  
  * **Expected Result:** (Should report command not found)  
    {  
      "stdout": "",  
      "stderr": "'non\_existent\_command' is not recognized as an internal or external command,\\noperable program or batch file.\\n",  
      "return\_code": 1,  
      "command": "non\_existent\_command",  
      "stdin": ""  
    }

### **2.2. ::browser\_code Self-Update Functionality**

* **Test Case 2.1: Successful ::browser\_code Injection and Update**  
  * **Action:** AGA::{"command":"::browser\_code", "stdin":"console.log(\\"New injected code ran successfully at \\" \+ new Date().toLocaleTimeString());"}  
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
  * **Pre-condition for External Observer:** The local\_agent.py server *must be stopped* before this test is initiated.  
  * **Action:** AGA::{"command":"echo agent down"}  
  * **Expected Result:** AGA Error: Failed to send command to Local Agent. Status: 0 or AGA Error: Timeout sending command to Local Agent.  
* **Test Case 3.4: Multiple AGA:: commands in one response (Last one picked)**  
  * **Action:** AGA::{"command":"echo first"} then later AGA::{"command":"echo second"}  
  * **Expected Result:**  
    {  
      "stdout": "second\\n",  
      "stderr": "",  
      "return\_code": 0,  
      "command": "echo second",  
      "stdin": ""  
    }

* **Test Case 3.5: No AGA:: command in response**  
  * **Action:** This is a normal chat response.  
  * **Expected Result:** No response from AGA (normal chat behavior).

### **2.4. UI-Specific (Gemini) Interactions**

* **Test Case 4.1: Spinner Visibility (Visual Confirmation for External Observer)**  
  * **Action:** AGA::{"command":"sleep 3"}  
  * **Expected Result:**  
    {  
      "stdout": "",  
      "stderr": "'sleep' is not recognized as an internal or external command,\\noperable program or batch file.\\n",  
      "return\_code": 1,  
      "command": "sleep 3",  
      "stdin": ""  
    }

  * **Note for External Observer:** The spinner in the top-right corner should appear when the command is sent and disappear when the (error) output is received.  
* **Test Case 4.2: Gemini UI Input/Send Mechanism (Visual Confirmation for External Observer)**  
  * **Action:** AGA::{"command":"echo Observing UI interaction."}  
  * **Expected Result:**  
    {  
      "stdout": "Observing UI interaction.\\n",  
      "stderr": "",  
      "return\_code": 0,  
      "command": "echo Observing UI interaction.",  
      "stdin": ""  
    }

  * **Note for External Observer:** You should observe the JSON output being programmatically typed into the Gemini input field and the message being automatically sent.

This concludes the reproducible test instructions.