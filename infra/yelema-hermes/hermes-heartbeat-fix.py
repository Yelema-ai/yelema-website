# Build-time fix for Hermes v2026.9.24, run once by the Dockerfile.
#
# Its terminal tool gives the optional `heartbeat` setting a minimum of 60 and no "off" value. GPT
# models fill in every setting, so they send `heartbeat: 60` on ordinary commands, and Hermes refuses
# every one of them ("notify/heartbeat only apply to background commands"): an expert then can't
# run the script that builds a Word or PDF file. Upstream fixed it on main by making 0 the minimum
# and the default (NousResearch/hermes-agent#119196, commit 4317ed0e71); this applies the same
# change. Drop it once HERMES_TAG ships a Hermes release that includes that commit.
import pathlib
import py_compile
import sys

path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/usr/local/lib/hermes/hermes-agent/tools/terminal_tool.py")
src = path.read_text()
old = '''            "heartbeat": {
                "type": "integer",
                "minimum": 60,
                "description": "With background=true'''
new = '''            "heartbeat": {
                "type": "integer",
                "minimum": 0,
                "default": 0,
                "description": "0 disables. With background=true'''
if '"heartbeat": {\n                "type": "integer",\n                "minimum": 0,' in src:
    print("hermes-heartbeat-fix: this Hermes already has the fix; remove this step from the Dockerfile")
    sys.exit(0)
if src.count(old) != 1:
    sys.exit("hermes-heartbeat-fix: the terminal schema changed; check whether this fix is still needed")
path.write_text(src.replace(old, new))
py_compile.compile(str(path), doraise=True)
print("hermes-heartbeat-fix: applied")
