import { useState } from "react";

function QuizModal({
  open,
  question,
  onAnswer,
  feedback,
  currentNumber,
  totalQuestions,
  correctAnswerCount,
  onPause,
}) {
  const [selected, setSelected] = useState(null);

  if (!open || !question) return null;

  function handleClick(choice) {
    if (selected) return; // 🚫 LOCK after first click

    setSelected(choice);
    onAnswer(choice);
  }

  return (
    <div className="modalOverlay">
      <div className="quizCard">
        <div className="quizProgress">
          Question {currentNumber} of {totalQuestions}
        </div>

        <h2>Study Quiz 📚</h2>

        <p className="quizSubtitle">Choose the correct answer</p>

        <div className="questionBox">
          <p className="questionText">{question.question}</p>
        </div>

        <div className="choices">
          {question.choices.map((choice, index) => {
            let className = "choiceButton";

            if (selected) {
              if (choice === question.answer) {
                className += " correct";
              } else if (choice === selected) {
                className += " wrong";
              }
            }

            return (
              <button
                key={index}
                className={className}
                onClick={() => handleClick(choice)}
              >
                {choice}
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className="feedbackBox">
            <p>{feedback}</p>

            {selected && selected !== question.answer && (
              <p className="correctAnswer">
                Correct answer: <b>{question.answer}</b>
              </p>
            )}
          </div>
        )}
        {correctAnswerCount >= 5 && !feedback && (
          <button
            type="button"
            className="pauseQuizButton"
            onClick={onPause}
          >
            Pause Quiz
          </button>
        )}
      </div>
    </div>
  );
}

export default QuizModal;