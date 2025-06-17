# Agentic Gemini Augmentation (AGA) Prototype

## 1. Introduction: The Press Release

FOR IMMEDIATE RELEASE

**New Prototype "AGA" Bridges Natural Language with Native Machine Control Across Multiple UIs**

Today, developers announced a significant architectural upgrade to the Agentic Gemini Augmentation (AGA) functional prototype. The system, which creates a direct, executable link between Large Language Models (LLMs) and a local computer's operating system shell, now features an extensible UI adapter pattern. This allows AGA to operate not just with Google's Gemini web UI, but also with other platforms like Google AI Studio, with a clear path to supporting additional UIs like LMArena.

The AGA prototype validates a novel two-part architecture: a reactive, multi-UI Browser-Side Controller that observes the active LLM UI, and a high-performance Local Agent that executes commands. This paradigm moves beyond simple chatbots by granting LLMs agency within a user's personal computing environment, now with broader applicability.

## 2. The Customer & The Problem

The target user for AGA is the Power User, Developer, or AI Researcher. This user operates at the intersection of creative problem-solving and deep technical implementation.

The core problem this user faces is one of high-friction translation. They can conceive of a complex, multi-step digital task (e.g., "Find the top 5 articles on Hacker News, summarize them, and create a new git branch with the summaries"), but executing it requires manually translating that high-level intent into a series of low-level, disparate actions: browser clicks, copy-pasting, terminal commands, and IDE interactions. Each step is a context switch that drains focus and time.

Current tools solve pieces of this problem but not the whole. LLMs are excellent at reasoning and generating plans but lack the agency to execute them. Automation tools like Playwright or Zapier are powerful but require structured, pre-programmed scripts. There is no fluid, conversational interface that can directly command the full power of a personal computer. AGA is being built to solve this problem by creating a single, low-friction pipeline from high-level intent to low-level execution.

## 3. The Solution: Technical Architecture

The AGA prototype uses a modular system designed to prove the core pipeline is viable across different LLM web interfaces. It consists of two main components that communicate locally: the Browser-Side Controller and the Local Agent.

**System Architecture:**

A command's journey begins in an LLM's web UI (e.g., Gemini, AI Studio).
1.  The **Browser-Side Controller** (a Tampermonkey script, current version v3.2.0), using a UI-specific **Adapter**, monitors network activity.
2.  When the active Adapter determines that the LLM has finished generating a response (based on UI-specific network signals or DOM changes), it scrapes the latest message content.
3.  The Controller then parses this content for an `AGA::` command.
    *   For standard shell commands (e.g., `AGA::{"command":"ls -la", "stdin":"input"}`), it sends the command payload to the **Local Agent's** `/command` endpoint. The Agent executes it and returns the result.
    *   For the special `::browser_code` command (e.g., `AGA::{"command":"::browser_code", "stdin":"alert('new code');"}`), it sends the JavaScript code to the Local Agent's `/inject_code` endpoint. The Agent modifies the `browser_controller.user.js` file on disk, increments its `@version`, and confirms.
4.  The Browser-Side Controller, via the active Adapter, injects the result (or a status message) back into the LLM's UI input field and submits it.
5.  For `::browser_code` success, the Controller also triggers Tampermonkey's update mechanism to load the modified script.

**Component Breakdown:**

*   **Browser-Side Controller (JavaScript v3.2.0):**
    *   **Core Generic Logic:** Handles command parsing (looking for `AGA::{...}` JSON), communication with the Local Agent (`/command`, `/inject_code`), the `::browser_code` update workflow, spinner display, and dynamic code execution.
    *   **`UIManager`:**
        *   Manages a collection of UI-specific **Adapters**.
        *   On script load, it selects and initializes the appropriate Adapter based on the current `window.location.href`.
    *   **UI Adapter Interface (Conceptual):** Each adapter is an object responsible for:
        *   `match(url)`: A function to determine if the adapter is suitable for the current webpage.
        *   `selectors`: An object containing UI-specific DOM selectors (e.g., for message content, input editor, send button).
        *   `networkTriggers`: Patterns or functions to identify relevant network requests for that UI (e.g., when a response stream starts/ends).
        *   `state`: Internal state management for the adapter (e.g., calm-down periods, waiting flags).
        *   `initialize()`: Sets up the adapter, including registering an event listener for `AgaNetworkResponseEvent`.
        *   `handleNetworkResponse(event)`: Processes `AgaNetworkResponseEvent` (see below). If it determines the LLM response is ready, it calls `getTextFromResponseElements()` and dispatches `AgaPotentialCommandEvent`.
        *   `getTextFromResponseElements()`: Extracts text content from the LLM's response area using its specific selectors.
        *   `injectTextAndClickSend(textToInject)`: Injects text into the UI's input field and programmatically submits it, using its specific selectors and interaction logic.
    *   **Event-Driven Network Interception:**
        *   Generic `XMLHttpRequest` and `fetch` overrides intercept all network traffic.
        *   Upon completion (or error) of any request, these interceptors dispatch a generic `AgaNetworkResponseEvent` containing details like `method`, `url`, `status`, and `error`.
        *   The active `UIManager.currentAdapter` listens for `AgaNetworkResponseEvent`. Its `handleNetworkResponse` method then applies UI-specific logic to decide if this event signifies that a new LLM response is ready for command processing.
    *   **Command Discovery:**
        *   If the adapter deems a network response significant, it extracts text from the UI and dispatches an `AgaPotentialCommandEvent` with the extracted text.
        *   A generic event listener for `AgaPotentialCommandEvent` then triggers `checkForCommandsInTextAndSend`, which parses the text for `AGA::` commands and delegates to `sendCommandToAgent` or `sendCodeToAgentForInjection`. These functions use the active adapter's `injectTextAndClickSend` for feedback.
    *   **Placeholder for Injected Code:** Contains `// --- INJECTED_BROWSER_CODE_START ---` and `// --- INJECTED_BROWSER_CODE_END ---` for the `::browser_code` command.

*   **Local Agent (Python):**
    *   **Framework:** Built with FastAPI. Pydantic models (`CommandRequest`, `CommandResponse`, `InjectCodeRequest`) ensure data validation.
    *   **Execution (Shell Commands):** The `POST /command` endpoint uses Python's `subprocess` module to run shell commands.
    *   **Code Injection (`::browser_code`):**
        *   The `POST /inject_code` endpoint receives JavaScript code.
        *   It reads `browser_controller.user.js`, replaces content between the injection markers, and **increments the `@version` number** in the script's header.
        *   Saves the modified file and returns a success/failure message.
    *   **API Contract:**
        *   `POST /command`: Expects `{"command": "string", "stdin": "string_or_null_or_omitted"}`.
        *   `POST /inject_code`: Expects `{"code_to_inject": "string_javascript_code"}`.
        *   `GET /browser_controller.user.js`: Serves the `browser_controller.user.js` file, enabling Tampermonkey's update mechanism.
    *   **Error Handling:** Uses FastAPI's `HTTPException`.

This modular, event-driven design allows for easier extension to support new LLM UIs by simply creating and registering a new adapter.

**Self-Updating Browser Controller via `::browser_code`:**

The `::browser_code` command, in conjunction with Tampermonkey's update feature and the Local Agent, enables a powerful self-updating mechanism.
*   **Prerequisites (in place with v3.2.0+):**
    *   The `browser_controller.user.js` script header includes `@downloadURL http://localhost:3000/browser_controller.user.js` and `@updateURL http://localhost:3000/browser_controller.user.js`.
    *   The `local_agent.py` has `GET /browser_controller.user.js` and `POST /inject_code` endpoints.
    *   The `browser_controller.user.js` contains the injection placeholder.
*   **The Automated "Self-Patching" Workflow:**
    1.  A `::browser_code` command is sent from the active LLM UI.
    2.  The Browser-Side Controller detects the command.
    3.  It sends the JavaScript code to the Local Agent's `POST /inject_code` endpoint.
    4.  The Local Agent modifies `browser_controller.user.js` on disk and increments its `@version`.
    5.  The Local Agent confirms success to the Browser-Side Controller.
    6.  The Controller, via the active UI Adapter, informs the user of success and that an update is being initiated.
    7.  It programmatically opens `http://localhost:3000/browser_controller.user.js` in a new tab.
    8.  Tampermonkey fetches the script. Seeing a higher `@version`, it handles the update.
    9.  After a delay, the Controller attempts to close the update tab and reloads the current LLM UI tab to activate the updated script.

## 4. The Development Plan: An Agile Approach

The prototype will be built using an agile methodology that prioritizes delivering a working end-to-end system as quickly as possible.

## 5. Frequently Asked Questions (FAQ)

*   **Why scrape the web UI instead of using the official Gemini API?**
    This project's core hypothesis is about creating an agent that can operate in the same environment as the user. Using the web UI, especially for future GUI automation tasks, is a foundational requirement. While a direct API is more stable, it does not allow the agent to see what the user sees, which is critical for the long-term vision of observing and automating user workflows.
*   **Isn't this architecture extremely fragile? What if the Gemini UI changes?**
    The UI-specific **Adapter** for a given LLM interface (e.g., the Gemini adapter) is still inherently coupled to that UI's DOM structure and network behavior. If that specific UI changes, its corresponding adapter will likely need updates. However, the core AGA logic (command parsing, agent communication, `::browser_code` workflow) is now generic and decoupled. This modularity means:
    *   Changes to one UI (e.g., Gemini) do not break functionality for other UIs (e.g., AI Studio).
    *   Updating or fixing an adapter for one UI is an isolated task.
    *   Adding support for a new UI involves creating a new adapter, not rewriting core logic.
    The `::browser_code` mechanism also allows for self-patching of adapters if needed.
*   **What are the security implications of this?**
    The security model is one of explicit trust. The system is designed for a developer to run on their own machine. It has no external-facing components. All communication is local, and the agent only has the permissions of the user who runs it. The prototype makes no attempt to sandbox commands; it is a power tool designed for a power user who understands the risks.
*   **How does this scale?**
    This prototype is not designed to scale in a traditional sense (i.e., to many users). It is a single-user, single-machine system. The "scaling" for this project refers to scaling its capabilities—adding web control, desktop control, and more complex reasoning—all of which build upon the foundational command-execution pipeline validated by this prototype.