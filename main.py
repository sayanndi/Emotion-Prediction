from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
import re # regex
from pydantic import BaseModel, Field
from tensorflow.keras.models import load_model
import pickle
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from tensorflow.keras.preprocessing.sequence import pad_sequences
import numpy as np




'''
1. We will make some constants
A. Model Path
B. Tokenizer Path
C. Max sequence length
D. Emotion Labels
E. Emotion Emojis

'''
#  A. Model Path
model_path = 'Artifacts/BiGRU_Model.keras'

# B. Tokenizer Path
tokenizer_path = 'Artifacts/tokenizer.pkl'

# C. Max sequence length
max_sequence_length = 50

# D. Emotion Labels
emotion_labels = ['sadness', 'joy', 'love', 'anger', 'fear', 'surprise']

# E. Emotion emojis
emotion_emojis = {
    'sadness': "😥",
    "joy": "😃",
    "love": "❤️",
    "anger": "😠",
    "fear": "😨",
    "surprise": "😯"

}

'''
# 2. Preprocess the upcoming text
Cleans raw text so it matches the format used while training.
A. Convert the text to lowercase.
B. Remove apostrophes (e.g can't -> cant)
C. Remove punctuations, special characters.
D. Remove extra spaces.
'''

def preprocess_text(text: str)-> str:
    text = text.lower()
    text = re.sub(r"'", "", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text;


'''
3. Request and response schemas
A. Text Input -> text schema sent by the user.
B. Prediction Response -> the output schema the emotion to predict
C. Health Response (Server health check)

'''

class TextInput(BaseModel):
    text: str = Field(..., 
                      min_length=1,
                      max_length=2000, 
                      description="The sentence to analyze", 
                      json_schema_extra={"example": "I feel so happy and excited"}
                      )
    

class PredictionResponse(BaseModel):
    text: str
    predicted_emotion: str
    confidence: float
    all_probabilities: dict[str, float]

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool



'''
4. Model loading and Lifespan Management
Load the model and tokenizer once the server starts up.

'''
dl_model = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading the model and tokenizer....")
    dl_model["BiGRU"] = load_model(model_path)
    with open(tokenizer_path, 'rb') as file:
        dl_model["tokenizer"] = pickle.load(file)
    print("Model are loaded successfully...")

    yield #Pause, model is loaded and server is running and at this point model waits for request

    dl_model.clear() # Ek baar server band ho geya model memory se clear ho jayega



'''
5. Mount the static files to the FastAPI app
A. Enable CORS(Cross-Origin resource sharing) to allow requests from different origins.

'''
app = FastAPI(
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


app.mount('/static', StaticFiles(directory='static'), name="static")


'''
6. API Endpoints
A. Server UI at homepage ('/')
B. Health Check Endpoint ('/health')
C. Predict Emotion Endpoint ('/predict')

'''

# A. Server UI at homepage ('/')

@app.get('/', include_in_schema=False)
def server_ui():
    return FileResponse('static/index.html')

# B. Health Check Endpoint ('/health')
@app.get('/health', response_model=HealthResponse)
def health_check():
    return HealthResponse(status="server is running", model_loaded=bool(dl_model))

# C. Predict Emotion Endpoint ('/predict')
@app.post('/predict', response_model=PredictionResponse)
def health_emotion(text_input: TextInput):
    # 1. Clean the input sentences
    # 2. Convert the words into numeric using tokenizer
    # 3. Pad the sequences using uniform length
    # 4. Run prediction using BiGRU model
    # 5. Return the top emotion and full probability breakdown

    BiGRU_model = dl_model.get("BiGRU")
    tokenizer_model = dl_model.get("tokenizer")

    if BiGRU_model is None or tokenizer_model is None:
        raise HTTPException(status_code=503, detail="The model is not loaded yet, please try again later.")

    #1.
    cleaned_text = preprocess_text(text_input.text)

    #2. 
    tokenize_text = tokenizer_model.texts_to_sequences([cleaned_text])
    padded_sequence = pad_sequences(
        tokenize_text,
        maxlen = max_sequence_length,
        padding='post',
        truncating='post'
    )

    probabilities = BiGRU_model.predict(padded_sequence)[0]

    top_emotion_index = int(np.argmax(probabilities))

    all_probabilities = {
        label: float(prob) for prob, label in zip(probabilities, emotion_labels)
    }

    return PredictionResponse(
        text = text_input.text,
        predicted_emotion=emotion_labels[top_emotion_index],
        confidence=float(probabilities[top_emotion_index]),
        all_probabilities=all_probabilities
    )





