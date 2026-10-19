from fastapi import FastAPI, HTTPException, Query

app = FastAPI(title="Study with Me Quiz API")

PHARMACOLOGY_QUESTIONS = [
    {
        "question": "Which processes are included in pharmacokinetics?",
        "choices": [
            "Absorption, distribution, metabolism, and excretion",
            "Diagnosis, treatment, monitoring, and prevention",
            "Receptor binding, signal transduction, and gene expression",
            "Efficacy, safety, adherence, and cost",
        ],
        "answer": "Absorption, distribution, metabolism, and excretion",
        "explanation": "Pharmacokinetics describes what the body does to a drug.",
    },
    {
        "question": "What does a receptor agonist generally do?",
        "choices": [
            "Binds to a receptor and activates it",
            "Binds to a receptor and prevents activation",
            "Accelerates the excretion of every drug",
            "Irreversibly destroys the receptor",
        ],
        "answer": "Binds to a receptor and activates it",
        "explanation": "An agonist has affinity for a receptor and produces a response.",
    },
    {
        "question": "What is the usual effect of first-pass metabolism on an oral drug?",
        "choices": [
            "It can reduce the amount reaching systemic circulation",
            "It guarantees a longer half-life",
            "It prevents absorption from the gastrointestinal tract",
            "It converts every prodrug into an inactive compound",
        ],
        "answer": "It can reduce the amount reaching systemic circulation",
        "explanation": "Metabolism in the gut wall and liver can lower oral bioavailability.",
    },
    {
        "question": "What does a drug's therapeutic index compare?",
        "choices": [
            "Toxic dose to effective dose",
            "Absorption rate to excretion rate",
            "Brand-name cost to generic cost",
            "Plasma concentration to volume of distribution",
        ],
        "answer": "Toxic dose to effective dose",
        "explanation": "The therapeutic index is a measure of the margin between effective and toxic doses.",
    },
    {
        "question": "Which statement best describes a competitive antagonist?",
        "choices": [
            "It competes with an agonist for receptor binding",
            "It activates the receptor more strongly than an agonist",
            "It increases drug absorption in the intestine",
            "It permanently raises the number of receptors",
        ],
        "answer": "It competes with an agonist for receptor binding",
        "explanation": "A competitive antagonist occupies receptor sites without activating them.",
    },
]


@app.get("/generateQuiz")
def generate_quiz(topic: str = Query(min_length=1, max_length=80)):
    normalized_topic = topic.strip().casefold()
    if normalized_topic != "pharmacology":
        raise HTTPException(
            status_code=404,
            detail=f"No local quiz questions are available for topic '{topic.strip()}'.",
        )

    return {"topic": "pharmacology", "quiz": PHARMACOLOGY_QUESTIONS}
