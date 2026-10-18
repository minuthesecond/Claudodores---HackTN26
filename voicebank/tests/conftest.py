import os
import sys

# Import voicebank modules as the server does (it runs from voicebank/)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
