from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import subprocess
import shlex
from fastapi.responses import FileResponse, JSONResponse # Added JSONResponse
import os

app = FastAPI()

class CommandRequest(BaseModel):
    command: str
    stdin: str | None = "" # Add stdin field, default to empty string if not provided

class CommandResponse(BaseModel):
    stdout: str
    stderr: str
    return_code: int
    command: str # Include the original command
    stdin: str | None = "" # Include the original stdin

class InjectCodeRequest(BaseModel): # New model for the inject_code endpoint
    code_to_inject: str

@app.post("/command", response_model=CommandResponse)
async def execute_command(request: CommandRequest):
    """
    Executes a shell command and returns its output.
    Accepts a command and an optional stdin string.
    Refactored with Guard Clauses.
    """
    try:
        # Guard Clause: Ensure the command is a string
        if not isinstance(request.command, str):
            raise HTTPException(status_code=400, detail="Command must be a string.")
        
        # Guard Clause: Ensure stdin is a string if provided
        if request.stdin is not None and not isinstance(request.stdin, str):
            raise HTTPException(status_code=400, detail="stdin must be a string if provided.")

        # Main logic proceeds if guard clauses are passed
        process_input = request.stdin # Will be None if request.stdin was None, or the string value

        process = subprocess.run(
            request.command,
            shell=True,
            capture_output=True,
            text=True,
            input=process_input, # Pass stdin to the subprocess
            check=False # Don't raise an exception for non-zero exit codes
        )
        
        return CommandResponse(
            command=request.command,
            stdin=request.stdin,
            stdout=process.stdout,
            stderr=process.stderr,
            return_code=process.returncode
        )
    except HTTPException: # Re-raise HTTPException to let FastAPI handle it
        raise
    except Exception as e:
        # Log the exception server-side for debugging
        print(f"Error executing command: {request.command} with stdin: {request.stdin}, Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to execute command: {str(e)}")

# New endpoint to serve the browser controller script
BROWSER_CONTROLLER_SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "browser_controller.user.js")

@app.get("/script")
async def serve_script():
    """
    Serves the browser_controller.user.js file.
    """
    if not os.path.exists(BROWSER_CONTROLLER_SCRIPT_PATH):
        raise HTTPException(status_code=404, detail="Browser controller script not found.")
    return FileResponse(BROWSER_CONTROLLER_SCRIPT_PATH, media_type='application/javascript', headers={"Content-Disposition": f"attachment; filename=browser_controller.user.js"})

# New endpoint to inject code into the browser controller script
@app.post("/inject_code")
async def inject_code_into_script(request: InjectCodeRequest):
    """
    Injects the provided JavaScript code into a placeholder
    in the browser_controller.user.js file using Guard Clauses.
    """
    start_marker = "// --- INJECTED_BROWSER_CODE_START ---"
    end_marker = "// --- INJECTED_BROWSER_CODE_END ---"

    # Guard Clause: Check if the script file exists
    if not os.path.exists(BROWSER_CONTROLLER_SCRIPT_PATH):
        # Log server-side for easier debugging if needed
        print(f"Critical Error: AGA browser_controller.user.js not found at configured path: {BROWSER_CONTROLLER_SCRIPT_PATH}")
        raise HTTPException(status_code=404, detail=f"Browser controller script file not found on server.")

    try:
        with open(BROWSER_CONTROLLER_SCRIPT_PATH, "r+", encoding="utf-8") as f:
            content = f.read()

            # Guard Clause: Check for start marker
            start_index = content.find(start_marker)
            if start_index == -1:
                print(f"Critical Error: Start marker '{start_marker}' not found in {BROWSER_CONTROLLER_SCRIPT_PATH}.")
                raise HTTPException(status_code=500, detail=f"Start marker '{start_marker}' not found in browser_controller.user.js. Injection aborted.")

            # Guard Clause: Check for end marker after start marker
            end_index = content.find(end_marker, start_index + len(start_marker))
            if end_index == -1:
                print(f"Critical Error: End marker '{end_marker}' not found after start marker in {BROWSER_CONTROLLER_SCRIPT_PATH}.")
                raise HTTPException(status_code=500, detail=f"End marker '{end_marker}' not found after start marker in browser_controller.user.js. Injection aborted.")

            # Proceed with injection logic if all guards are passed
            # Find the end of the start_marker line to insert after it
            start_marker_line_end = content.find("\n", start_index)
            if start_marker_line_end == -1: # Should not happen if markers are on their own lines and not at EOF
                # This case implies start_marker is the last line or file is malformed.
                # For robustness, treat as inserting immediately after the marker text itself.
                start_marker_line_end = start_index + len(start_marker)
            else:
                start_marker_line_end += 1 # Move to the beginning of the next line for insertion
            
            injected_code = request.code_to_inject.strip()
            # Ensure the injected code ends with a newline if it doesn't already, for clean separation
            if not injected_code.endswith('\n'):
                injected_code += '\n'

            # The content between start_marker_line_end and end_index is replaced.
            # The end_marker itself is preserved, and we add 4 spaces for its typical indentation.
            new_content = content[:start_marker_line_end] + injected_code + "    " + content[end_index:]
            
            f.seek(0)
            f.write(new_content)
            f.truncate()

        return JSONResponse(content={"success": True, "message": "Code injected successfully."}, status_code=200)
    
    except HTTPException: # Re-raise HTTPException if it was raised by a guard or other logic
        raise
    except Exception as e:
        # Log the exception server-side for debugging
        print(f"Error during file operation or unexpected issue in /inject_code: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred on the server during code injection: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    # It's good practice to make host and port configurable,
    # but for simplicity, we'll hardcode them here.
    # The Local Agent listens on localhost only.
    uvicorn.run(app, host="127.0.0.1", port=3000)

# To run this:
# 1. Make sure you have fastapi and uvicorn installed:
#    pip install fastapi "uvicorn[standard]"
# 2. Run the script:
#    python main.py
# The server will be available at http://127.0.0.1:3000