from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import subprocess
import shlex

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