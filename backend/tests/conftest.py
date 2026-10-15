import os
import tempfile

# Point the app at a throwaway database before anything imports it, so tests never touch
# the real data/airbud.db (and the real users in it).
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
