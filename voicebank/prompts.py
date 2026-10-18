"""
What the patient reads aloud when banking their voice, and the phrases pre-spoken in every new voice.

The prompts mix the ICU phrases (so the clone hears the patient say exactly what they'll need)
with lines from the Rainbow Passage, which speech therapists use because it covers nearly every
English sound. Read at a normal pace, all eight take about 45 seconds.
"""

PROMPTS = [
    "I need water, and could you please call the nurse?",
    "I am in pain, but I'm okay for now.",
    "Please call my family and tell them I love them.",
    "When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow.",
    "The rainbow is a division of white light into many beautiful colors.",
    "These take the shape of a long round arch, with its path high above.",
    "Throughout the centuries people have explained the rainbow in various ways.",
    "Thank you. Yes. No. Where am I? I am cold.",
]

# Same list as voice/voice_server.py, pre-spoken when a voice is approved so they play instantly
PHRASES = [
    "i am in pain", "i can't breathe", "i need water", "call the nurse",
    "call my family", "i am cold", "i am hot", "yes", "no", "thank you",
    "i need to use the bathroom", "where am i", "i am scared",
]

PREVIEW = "hi, it's me. i need some water, and could you please call my family?"
