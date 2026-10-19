import { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import QuizModal from "./components/QuizModal";
import "./App.css";

import logo from "./assets/images/logo.jpg";

import face from "./assets/images/face.webp";
import melodyIcon from "./assets/images/melody.png";
import farmTent from "./assets/images/farm-tent.png";
import campfireSpriteSheet from "./assets/images/campfire-animation.png";
import waterfallSpriteSheet from "./assets/images/farm-waterfall-animation.png";
import harveySpriteSheet from "./assets/images/stardew-valley-harvey-animated--poster--26d5de.gif";
import pageBackground from "./assets/backgrounds/background.jpg";
import melodyBackground from "./assets/backgrounds/melody-bg.jpeg";
import farmBackground from "./assets/backgrounds/Farm-Updated.png";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const plantSpriteFiles = import.meta.glob(
  "./assets/plants/plant-*/stage-*.png",
  { eager: true, query: "?url", import: "default" }
);
const plantStages = Array.from({ length: 7 }, (_, plantIndex) =>
  Array.from({ length: 6 }, (_, stageIndex) => {
    const plantNumber = String(plantIndex + 1).padStart(2, "0");
    const stageNumber = String(stageIndex + 1).padStart(2, "0");
    return plantSpriteFiles[
      `./assets/plants/plant-${plantNumber}/stage-${stageNumber}.png`
    ];
  })
);
const cropNames = [
  "Cabbage",
  "Turnip",
  "Tomato",
  "Radish",
  "Corn",
  "Bell Pepper",
  "Carrot",
];
const plantCatalog = plantStages.map((stages, index) => ({
  type: index,
  name: cropNames[index],
  stages,
  seedPrice: 5 + index * 2 + (index >= 4 ? 5 : 0),
  growthInterval: 3000 + index * 500,
  sellPrice: 12 + index * 4,
}));
const rewardImageFiles = import.meta.glob(
  "./assets/images/[1-9].jpg",
  { eager: true, query: "?url", import: "default" }
);
const rewardImages = Object.entries(rewardImageFiles)
  .sort(
    ([pathA], [pathB]) =>
      Number(pathA.match(/\d+/)?.[0]) - Number(pathB.match(/\d+/)?.[0])
  )
  .map(([, src], index) => ({
    id: index + 1,
    name: `Reward Image ${index + 1}`,
    src,
    price: 100 + index * 40,
  }));
const farmShopPosition = { x: 89, y: 40 };
const farmShopInteractionRadius = 10;
const playerMovementInterval = 300;
const maxSeedInventory = 5;
const plantAnnouncementDuration = 400;
const quizCompletionAnnouncementDuration = 500;
const farmBackgroundScale = 1.23;
const farmWaterAreas = [
  [
    [12, 29],
    [13, 25],
    [16, 22],
    [21, 21],
    [23, 18],
    [29, 18],
    [32, 21],
    [32, 29],
    [29, 32],
    [24, 33],
    [20, 34],
    [16, 34],
  ],
  [
    [13, 62],
    [14, 58],
    [17, 55],
    [21, 53],
    [27, 53],
    [31, 55],
    [33, 59],
    [33, 65],
    [31, 69],
    [29, 72],
    [28, 78],
    [25, 81],
    [21, 81],
    [18, 77],
    [16, 73],
    [14, 70],
    [13, 66],
  ],
];
const farmCampfireArea = [
  [73.8, 51.5],
  [74.1, 49.3],
  [75.3, 48],
  [77, 48.1],
  [78.3, 49.7],
  [78.6, 51.7],
  [77.7, 53.7],
  [76.2, 54.4],
  [74.8, 53.8],
];
const farmShopArea = [
  [84, 30],
  [95, 30],
  [95, 50],
  [84, 50],
];
const farmCampfireCollisionRadius = 0.5;
const farmWaterCollisionRadius = 2.5;
const quizCoinBudget = 50;
const walletStorageKey = "study-with-me-coins";
const ownedRewardsStorageKey = "study-with-me-owned-rewards";
const equippedRewardStorageKey = "study-with-me-equipped-reward";
const equippedIconStorageKey = "study-with-me-equipped-icon";

function isPointInPolygon(point, polygon) {
  let inside = false;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const [x, y] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    const intersects =
      y > point.y !== previousY > point.y &&
      point.x <
        ((previousX - x) * (point.y - y)) / (previousY - y) + x;

    if (intersects) inside = !inside;
  }

  return inside;
}

function isNearPolygonEdge(point, polygon, radius) {
  return polygon.some(([x, y], index) => {
    const [nextX, nextY] = polygon[(index + 1) % polygon.length];
    const deltaX = nextX - x;
    const deltaY = nextY - y;
    const lengthSquared = deltaX ** 2 + deltaY ** 2;
    const projection = Math.max(
      0,
      Math.min(
        1,
        ((point.x - x) * deltaX + (point.y - y) * deltaY) / lengthSquared
      )
    );
    const closestX = x + projection * deltaX;
    const closestY = y + projection * deltaY;

    return Math.hypot(point.x - closestX, point.y - closestY) <= radius;
  });
}

function isPositionBlocked(position) {
  const point = {
    x: (position.x + (farmBackgroundScale - 1) * 50) / farmBackgroundScale,
    y: (position.y + (farmBackgroundScale - 1) * 50) / farmBackgroundScale,
  };

  const isWaterCollision = farmWaterAreas.some(
    (area) =>
      isPointInPolygon(point, area) ||
      isNearPolygonEdge(point, area, farmWaterCollisionRadius)
  );

  return (
    isWaterCollision ||
    isPointInPolygon(point, farmCampfireArea) ||
    isNearPolygonEdge(point, farmCampfireArea, farmCampfireCollisionRadius) ||
    isPointInPolygon(point, farmShopArea)
  );
}

function loadStoredCoins() {
  try {
    const savedCoins = Number(localStorage.getItem(walletStorageKey));
    return Number.isSafeInteger(savedCoins) && savedCoins >= 0 ? savedCoins : 0;
  } catch (error) {
    console.error("Could not load the saved coin balance.", error);
    return 0;
  }
}

function loadOwnedRewards() {
  try {
    const savedRewards = JSON.parse(
      localStorage.getItem(ownedRewardsStorageKey) || "[]"
    );
    return Array.isArray(savedRewards)
      ? savedRewards.filter((id) =>
          rewardImages.some((reward) => reward.id === id)
        )
      : [];
  } catch (error) {
    console.error("Could not load owned reward images.", error);
    return [];
  }
}

function loadEquippedReward(ownedRewards) {
  try {
    const savedReward = Number(localStorage.getItem(equippedRewardStorageKey));
    return ownedRewards.includes(savedReward) ? savedReward : null;
  } catch (error) {
    console.error("Could not load the equipped reward image.", error);
    return null;
  }
}

function loadEquippedIcon(ownedRewards) {
  try {
    const savedIcon = Number(localStorage.getItem(equippedIconStorageKey));
    return ownedRewards.includes(savedIcon) ? savedIcon : null;
  } catch (error) {
    console.error("Could not load the selected character icon.", error);
    return null;
  }
}

function createPlant(id, type, x, y, now = Date.now()) {
  const growthInterval = plantCatalog[type].growthInterval;

  return {
    tileId: id,
    type,
    x,
    y,
    stage: 0,
    growthInterval,
    nextGrowthAt: now + growthInterval,
  };
}

function App() {
  const [showStartScreen, setShowStartScreen] = useState(true);

  const [theme, setTheme] = useState("harvey");
  const [showQuiz, setShowQuiz] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const [reviewerText, setReviewerText] = useState("");
  const [questions, setQuestions] = useState([]);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [usedQuestionCount, setUsedQuestionCount] = useState(0);
  const [correctAnswerCount, setCorrectAnswerCount] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState("Upload your reviewer first 💖");
  const [quizComplete, setQuizComplete] = useState(false);
  const [quizPaused, setQuizPaused] = useState(false);
  const [quizCompletionAnnouncement, setQuizCompletionAnnouncement] =
    useState(null);
  const [playerPosition, setPlayerPosition] = useState({ x: 81, y: 46 });
  const playerPositionRef = useRef(playerPosition);
  const pressedMovementKeysRef = useRef(new Set());
  const lastPlayerMovementDirectionRef = useRef(null);
  const lastPlayerMovementAtRef = useRef(0);
  const [isPlayerMoving, setIsPlayerMoving] = useState(false);
  const [coins, setCoins] = useState(loadStoredCoins);
  const [seedInventory, setSeedInventory] = useState([]);
  const [selectedSeedId, setSelectedSeedId] = useState(null);
  const [hasBoughtFirstSeed, setHasBoughtFirstSeed] = useState(false);
  const [farmMessage, setFarmMessage] = useState("");
  const [plantAnnouncement, setPlantAnnouncement] = useState("");
  const [ownedRewardImages, setOwnedRewardImages] = useState(loadOwnedRewards);
  const [equippedRewardImageId, setEquippedRewardImageId] = useState(() =>
    loadEquippedReward(loadOwnedRewards())
  );
  const [equippedIconRewardId, setEquippedIconRewardId] = useState(() =>
    loadEquippedIcon(loadOwnedRewards())
  );
  const [showShop, setShowShop] = useState(false);
  const [showPhotoAlbum, setShowPhotoAlbum] = useState(false);
  const [viewingRewardImageId, setViewingRewardImageId] = useState(null);
  const [photoAlbumMessage, setPhotoAlbumMessage] = useState("");
  const [shopSection, setShopSection] = useState("seeds");
  const [shopMessage, setShopMessage] = useState("");
  const answerTimer = useRef(null);
  const [plants, setPlants] = useState([]);
  const plantsRef = useRef(plants);
  const nextPlantIdRef = useRef(0);
  const nextSeedIdRef = useRef(0);
  const nextPlantAnnouncementIdRef = useRef(0);
  const plantAnnouncementTimerRef = useRef(null);
  const nextQuizAnnouncementIdRef = useRef(0);
  const quizAnnouncementTimerRef = useRef(null);

  const themeIcon = theme === "melody" ? melodyIcon : face;
  const currentQuestion = quizQuestions[questionIndex] || null;
  const isNearFarmShop =
    Math.hypot(
      playerPosition.x - farmShopPosition.x,
      playerPosition.y - farmShopPosition.y
    ) <= farmShopInteractionRadius;
  const equippedRewardImage = rewardImages.find(
    (reward) => reward.id === equippedRewardImageId
  );
  const equippedIconImage = rewardImages.find(
    (reward) => reward.id === equippedIconRewardId
  );
  const icon = equippedIconImage?.src || themeIcon;
  const viewingRewardImage = rewardImages.find(
    (reward) => reward.id === viewingRewardImageId
  );
  const selectedSeed = seedInventory.find((seed) => seed.id === selectedSeedId);

  useEffect(() => {
    document.body.style.backgroundImage = `url(${
      theme === "melody" ? melodyBackground : pageBackground
    })`;
  }, [theme]);

  useEffect(() => {
    return () => {
      clearTimeout(answerTimer.current);
      clearTimeout(plantAnnouncementTimerRef.current);
      clearTimeout(quizAnnouncementTimerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(walletStorageKey, String(coins));
      localStorage.setItem(
        ownedRewardsStorageKey,
        JSON.stringify(ownedRewardImages)
      );
      if (equippedRewardImageId === null) {
        localStorage.removeItem(equippedRewardStorageKey);
      } else {
        localStorage.setItem(
          equippedRewardStorageKey,
          String(equippedRewardImageId)
        );
      }
      if (equippedIconRewardId === null) {
        localStorage.removeItem(equippedIconStorageKey);
      } else {
        localStorage.setItem(
          equippedIconStorageKey,
          String(equippedIconRewardId)
        );
      }
    } catch (error) {
      console.error(
        "Could not save the coin balance, reward images, or selected icon.",
        error
      );
    }
  }, [coins, ownedRewardImages, equippedRewardImageId, equippedIconRewardId]);

  useEffect(() => {
    function handleMovementKeyDown(event) {
      if (showStartScreen || showQuiz || showShop) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "e" && isNearFarmShop) {
        event.preventDefault();
        setShopSection("seeds");
        setShopMessage("");
        setShowShop(true);
        return;
      }

      if (!["w", "a", "s", "d"].includes(key)) return;

      event.preventDefault();
      pressedMovementKeysRef.current.add(key);
      const now = Date.now();

      const keys = pressedMovementKeysRef.current;
      const horizontal = Number(keys.has("d")) - Number(keys.has("a"));
      const vertical = Number(keys.has("s")) - Number(keys.has("w"));
      const directionLength = Math.hypot(horizontal, vertical);
      if (directionLength === 0) return;

      const previousDirection = lastPlayerMovementDirectionRef.current;
      const directionChanged =
        !previousDirection ||
        previousDirection.horizontal !== horizontal ||
        previousDirection.vertical !== vertical;
      if (
        !directionChanged &&
        now - lastPlayerMovementAtRef.current < playerMovementInterval
      ) {
        return;
      }
      lastPlayerMovementDirectionRef.current = { horizontal, vertical };
      lastPlayerMovementAtRef.current = now;

      const step = 3 / directionLength;
      const currentPosition = playerPositionRef.current;
      const nextPosition = {
        x: Math.max(18, Math.min(82, currentPosition.x + horizontal * step)),
        y: Math.max(25, Math.min(92, currentPosition.y + vertical * step)),
      };
      if (
        (nextPosition.x === currentPosition.x &&
          nextPosition.y === currentPosition.y) ||
        isPositionBlocked(nextPosition)
      ) {
        setIsPlayerMoving(false);
        return;
      }

      playerPositionRef.current = nextPosition;
      setIsPlayerMoving(true);
      setPlayerPosition(nextPosition);
    }

    function handleMovementKeyUp(event) {
      const key = event.key.toLowerCase();
      pressedMovementKeysRef.current.delete(key);
      if (pressedMovementKeysRef.current.size === 0) {
        lastPlayerMovementDirectionRef.current = null;
      }
      setIsPlayerMoving(pressedMovementKeysRef.current.size > 0);
    }

    function handleWindowBlur() {
      pressedMovementKeysRef.current.clear();
      lastPlayerMovementDirectionRef.current = null;
      setIsPlayerMoving(false);
    }

    window.addEventListener("keydown", handleMovementKeyDown);
    window.addEventListener("keyup", handleMovementKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleMovementKeyDown);
      window.removeEventListener("keyup", handleMovementKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [showStartScreen, showQuiz, showShop, isNearFarmShop]);

  useEffect(() => {
    if (showStartScreen) return undefined;

    const now = Date.now();
    plantsRef.current = plantsRef.current.map((plant) => ({
      ...plant,
      nextGrowthAt:
        plant.stage < plantCatalog[plant.type].stages.length
          ? plant.nextGrowthAt || now + plant.growthInterval
          : null,
    }));

    const growthTimer = window.setInterval(() => {
      const currentTime = Date.now();
      const nextPlants = plantsRef.current.map((plant) => {
        if (
          plant.stage >= plantCatalog[plant.type].stages.length ||
          !plant.nextGrowthAt ||
          currentTime < plant.nextGrowthAt
        ) {
          return plant;
        }

        const nextStage = plant.stage + 1;
        return {
          ...plant,
          stage: nextStage,
          nextGrowthAt:
            nextStage < plantCatalog[plant.type].stages.length
              ? currentTime + plant.growthInterval
              : null,
        };
      });

      if (nextPlants.some((plant, index) => plant !== plantsRef.current[index])) {
        plantsRef.current = nextPlants;
        setPlants(nextPlants);
      }
    }, 250);

    return () => window.clearInterval(growthTimer);
  }, [showStartScreen]);

  function shuffle(array) {
    return [...array].sort(() => Math.random() - 0.5);
  }

  async function readPdfFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";
    }

    return fullText;
  }

  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    setHasStarted(false);
    setShowQuiz(false);
    setQuestions([]);
    setQuizQuestions([]);
    setQuizComplete(false);
    setUsedQuestionCount(0);
    setFeedback("");
    clearTimeout(answerTimer.current);
    setMessage("Reading your file... ✨");

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".pdf")) {
      const text = await readPdfFile(file);
      setReviewerText(text);
      setMessage("PDF uploaded! Click Generate Questions ✨");
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      setReviewerText(e.target.result);
      setMessage("Reviewer uploaded! Click Generate Questions ✨");
    };

    reader.readAsText(file);
  }

  function generateQuestions() {
    setHasStarted(false);
    setShowQuiz(false);
    setQuizComplete(false);
    setQuizQuestions([]);
    setFeedback("");
    setUsedQuestionCount(0);
    clearTimeout(answerTimer.current);

    if (!reviewerText.trim()) {
      setMessage("Upload or paste your reviewer first 😭");
      return;
    }

    const sentences = reviewerText
      .split(/[.!?]/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 40);

    if (sentences.length === 0) {
      setMessage("Your reviewer needs longer sentences 😭");
      return;
    }

    const commonWords = [
      "about",
      "after",
      "again",
      "also",
      "because",
      "before",
      "being",
      "between",
      "could",
      "every",
      "first",
      "from",
      "have",
      "their",
      "there",
      "these",
      "those",
      "this",
      "through",
      "under",
      "using",
      "where",
      "which",
      "while",
      "would",
      "should",
      "important",
      "example",
      "different",
      "following",
    ];

    const allWords = reviewerText
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(
        (word) =>
          word.length > 5 && !commonWords.includes(word.toLowerCase())
      );

    const uniqueWords = [...new Set(allWords)];
    const generated = [];

    sentences.forEach((sentence) => {
      const words = sentence
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(
          (word) =>
            word.length > 5 && !commonWords.includes(word.toLowerCase())
        );

      const answer = words[0];
      if (!answer) return;

      const shortSentence =
        sentence.length > 140 ? `${sentence.slice(0, 140)}...` : sentence;

      const wrongChoices = shuffle(
        uniqueWords.filter(
          (word) => word.toLowerCase() !== answer.toLowerCase()
        )
      ).slice(0, 3);

      while (wrongChoices.length < 3) {
        wrongChoices.push(["concept", "method", "process"][wrongChoices.length]);
      }

      const questionType = ["fill", "identify", "trueFalse"][
        Math.floor(Math.random() * 3)
      ];

      let questionObject;

      if (questionType === "fill") {
        const questionText = shortSentence.replace(
          new RegExp(answer, "i"),
          "_____"
        );

        questionObject = {
          question: `Fill in the blank: ${questionText}`,
          choices: shuffle([answer, ...wrongChoices]),
          answer,
        };
      }

      if (questionType === "identify") {
        questionObject = {
          question: `What term is described? "${shortSentence}"`,
          choices: shuffle([answer, ...wrongChoices]),
          answer,
        };
      }

      if (questionType === "trueFalse") {
        const isTrue = Math.random() > 0.5;
        let statement = shortSentence;

        if (!isTrue && uniqueWords.length > 0) {
          const replacementWord =
            uniqueWords[Math.floor(Math.random() * uniqueWords.length)];

          statement = shortSentence.replace(
            new RegExp(answer, "i"),
            replacementWord
          );
        }

        questionObject = {
          question: `True or False: "${statement}"`,
          choices: ["True", "False"],
          answer: isTrue ? "True" : "False",
        };
      }

      generated.push(questionObject);
    });

    if (generated.length === 0) {
      setMessage("Could not generate questions 😭");
      return;
    }

    const shuffledQuestions = shuffle(generated);

    setQuestions(shuffledQuestions);
    setMessage(`Generated ${shuffledQuestions.length} smart questions ✨`);
  }

  function startQuiz() {
    if (questions.length === 0) {
      setMessage("Generate questions first before starting 😭");
      return;
    }

    clearTimeout(answerTimer.current);
    setQuizQuestions(shuffle(questions));
    setQuestionIndex(0);
    setShowQuiz(true);
    setFeedback("");
    setQuizComplete(false);
    setQuizPaused(false);
    setCorrectAnswerCount(0);
    setHasStarted(true);
    setUsedQuestionCount(1);
  }

  function resumeQuiz() {
    setQuizPaused(false);
    setHasStarted(true);
    setShowQuiz(true);
  }

  function pauseQuiz() {
    clearTimeout(answerTimer.current);
    setFeedback("");
    setShowQuiz(false);
    setHasStarted(false);
    setQuizPaused(true);
  }

  function backToSetup() {
    clearTimeout(answerTimer.current);
    setHasStarted(false);
    setShowQuiz(false);
    setQuizComplete(false);
    setFeedback("");
    setQuizPaused(false);
    setMessage("Generate questions or start another quiz 💖");
  }

  function buySeed(type) {
    const seed = plantCatalog[type];
    if (!seed) return;

    if (seedInventory.length >= maxSeedInventory) {
      setShopMessage("Your seed inventory is full. Plant a seed before buying more.");
      return;
    }
    if (coins < seed.seedPrice) {
      setShopMessage(`Answer quiz questions to earn ${seed.seedPrice - coins} more coins.`);
      return;
    }

    const inventorySeed = { id: nextSeedIdRef.current++, type: seed.type };
    setSeedInventory((inventory) => [...inventory, inventorySeed]);
    setCoins((balance) => balance - seed.seedPrice);
    setSelectedSeedId(inventorySeed.id);
    setHasBoughtFirstSeed(true);
    setShopMessage(`${seed.name} Seed added to your inventory.`);
  }

  function plantSeedAt() {
    if (!selectedSeed) return;

    const position = playerPositionRef.current;
    const seed = plantCatalog[selectedSeed.type];

    if (
      position.x < 5 ||
      position.x > 95 ||
      position.y < 5 ||
      position.y > 95 ||
      isPositionBlocked(position)
    ) {
      setFarmMessage("Choose an open spot away from water, the fire, and tent.");
      return;
    }

    const overlapsPlant = plantsRef.current.some(
      (plant) =>
        Math.abs(plant.x - position.x) < 5 &&
        Math.abs(plant.y - position.y) < 5
    );
    if (overlapsPlant) {
      setFarmMessage("Choose a clear spot between your crops.");
      return;
    }

    const nextPlant = createPlant(
      nextPlantIdRef.current++,
      seed.type,
      position.x,
      position.y
    );
    const nextPlants = [...plantsRef.current, nextPlant];
    plantsRef.current = nextPlants;
    setPlants(nextPlants);
    setSeedInventory((inventory) =>
      inventory.filter((inventorySeed) => inventorySeed.id !== selectedSeed.id)
    );
    setSelectedSeedId(null);
    setFarmMessage("");
    setPlantAnnouncement({
      id: nextPlantAnnouncementIdRef.current++,
      message: `${seed.name} planted!`,
    });
    clearTimeout(plantAnnouncementTimerRef.current);
    plantAnnouncementTimerRef.current = window.setTimeout(() => {
      setPlantAnnouncement("");
    }, plantAnnouncementDuration);
  }

  function sellPlant(tileId) {
    const plant = plantsRef.current.find(
      (currentPlant) => currentPlant.tileId === tileId
    );
    if (!plant || plant.stage < plantCatalog[plant.type].stages.length) return;

    plantsRef.current = plantsRef.current.filter(
      (currentPlant) => currentPlant.tileId !== tileId
    );
    setPlants(plantsRef.current);
    setCoins((balance) => balance + plantCatalog[plant.type].sellPrice);
    setFarmMessage("");
    setShopMessage(
      `${plantCatalog[plant.type].name} sold for ${plantCatalog[plant.type].sellPrice} coins.`
    );
  }

  function buyOrEquipReward(reward) {
    if (ownedRewardImages.includes(reward.id)) {
      setEquippedRewardImageId(reward.id);
      setShopMessage(`${reward.name} is now displayed on your farm.`);
      return;
    }
    if (coins < reward.price) {
      setShopMessage(`Answer questions or sell crops to earn ${reward.price - coins} more coins.`);
      return;
    }

    setCoins(coins - reward.price);
    setOwnedRewardImages((owned) => [...owned, reward.id]);
    setEquippedRewardImageId(reward.id);
    setShopMessage(`${reward.name} purchased and equipped!`);
  }

  function setRewardAsIcon(reward) {
    if (!ownedRewardImages.includes(reward.id)) return;
    setEquippedIconRewardId(reward.id);
    setPhotoAlbumMessage(`${reward.name} is now your character icon.`);
  }

  function handleAnswer(choice) {
    if (!currentQuestion) return;

    const isCorrect = choice === currentQuestion.answer;
    const answerReward =
      Math.floor(
        (quizCoinBudget * (questionIndex + 1)) / quizQuestions.length
      ) -
      Math.floor((quizCoinBudget * questionIndex) / quizQuestions.length);
    if (isCorrect) {
      setCoins((balance) => balance + answerReward);
      setCorrectAnswerCount((count) => count + 1);
    }
    setFeedback(
      isCorrect
        ? `Correct! +${answerReward} coins ✨`
        : "Keep studying! 💖"
    );

    answerTimer.current = setTimeout(() => {
      if (questionIndex + 1 === quizQuestions.length) {
        setShowQuiz(false);
        setHasStarted(false);
        setQuizComplete(true);
        setQuizPaused(false);
        setMessage("Quiz complete! Great work 💖");
        setQuizCompletionAnnouncement({
          id: nextQuizAnnouncementIdRef.current++,
          message: "Quiz complete! Great work!",
        });
        clearTimeout(quizAnnouncementTimerRef.current);
        quizAnnouncementTimerRef.current = window.setTimeout(() => {
          setQuizCompletionAnnouncement(null);
        }, quizCompletionAnnouncementDuration);
      } else {
        setQuestionIndex((index) => index + 1);
        setUsedQuestionCount((count) => count + 1);
        setFeedback("");
      }
    }, 1400);
  }

  if (showStartScreen) {
    return (
      <div className="startScreen">
        <div className="startCard">
          <img src={logo} alt="Study with Me Logo" className="logo" />

          <h1>Study with Me 💖</h1>

          <p>Turn your reviewer into a study quiz 📚</p>

          <button
            className="startScreenButton"
            onClick={() => setShowStartScreen(false)}
          >
            Start ✨
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className={`app ${theme}`}>
        <section className="sidebar">
          {!hasStarted ? (
            <>
              <h1>Study with Me 💖</h1>

              <div className="appMessage">{message}</div>

              <div className="instructions">
                Upload or paste your reviewer, generate questions, and start
                studying.
              </div>

              <label>Character theme</label>
              <div className="themePicker">
                <button
                  className={`themeCard ${theme === "harvey" ? "activeTheme" : ""}`}
                  aria-pressed={theme === "harvey"}
                  onClick={() => setTheme("harvey")}
                >
                  <img src={face} alt="" />
                  Harvey
                </button>
                <button
                  className={`themeCard ${theme === "melody" ? "activeTheme" : ""}`}
                  aria-pressed={theme === "melody"}
                  onClick={() => setTheme("melody")}
                >
                  <img src={melodyIcon} alt="" />
                  Melody
                </button>
              </div>

              <div className="currentCharacterBox">
                <img src={icon} alt="Current character icon" />
              </div>

              <label>Import reviewer file</label>
              <input
                type="file"
                accept=".txt,.pdf"
                onChange={handleFileUpload}
              />

              <label>Reviewer text</label>
              <textarea
                placeholder="Upload or paste your reviewer here..."
                value={reviewerText}
                onChange={(e) => {
                  setReviewerText(e.target.value);
                  setHasStarted(false);
                  setShowQuiz(false);
                  setQuizComplete(false);
                  setQuestions([]);
                  setQuizQuestions([]);
                  setUsedQuestionCount(0);
                  setFeedback("");
                  clearTimeout(answerTimer.current);
                  setMessage("Reviewer edited. Generate questions again ✨");
                }}
              />

              <div className="buttonRow">
                <button onClick={generateQuestions}>
                  Generate Questions ✨
                </button>
                <button onClick={startQuiz}>Start Quiz 💖</button>
              </div>
            </>
          ) : (
            <div className="cleanSidebar">
              <h1>Study with Me 💖</h1>

              <div className="cleanCharacterBox">
                <img src={icon} alt="Current character" />
              </div>

              <div className="themePicker">
                <button
                  className={`themeCard ${theme === "harvey" ? "activeTheme" : ""}`}
                  aria-pressed={theme === "harvey"}
                  onClick={() => setTheme("harvey")}
                >
                  <img src={face} alt="" />
                  Harvey
                </button>
                <button
                  className={`themeCard ${theme === "melody" ? "activeTheme" : ""}`}
                  aria-pressed={theme === "melody"}
                  onClick={() => setTheme("melody")}
                >
                  <img src={melodyIcon} alt="" />
                  Melody
                </button>
              </div>

              <div className="cleanStatus">
                <p>Study quiz in progress 📚</p>
                <p>Keep going through your reviewer questions!</p>
              </div>

              <button onClick={backToSetup}>Back to Setup ✨</button>
            </div>
          )}
        </section>

        <section className="gameArea">
          <div
            className={`studyStage ${selectedSeed ? "plantingSeeds" : ""}`}
            style={{ "--farm-background": `url("${farmBackground}")` }}
            onClick={plantSeedAt}
          >
            <div
              className="farmWaterfallAnimation"
              aria-hidden="true"
              style={{
                "--waterfall-sprite": `url("${waterfallSpriteSheet}")`,
              }}
            />
            <div
              className="farmCampfireAnimation"
              aria-hidden="true"
              style={{
                "--campfire-sprite": `url("${campfireSpriteSheet}")`,
              }}
            />
            <div className="farmPlants" aria-label="Growing crops">
              {plants.map((plant) => {
                const crop = plantCatalog[plant.type];
                const isReady = plant.stage >= crop.stages.length;
                const cropStyle = {
                  left: `${plant.x}%`,
                  top: `${plant.y}%`,
                };
                const cropImage =
                  plant.stage === 0 ? null : crop.stages[plant.stage - 1];

                if (isReady) {
                  return (
                    <button
                      className="farmCrop farmCropReady"
                      key={plant.tileId}
                      type="button"
                      style={cropStyle}
                      aria-label={`Sell ${crop.name} for ${crop.sellPrice} coins`}
                      title={`Sell ${crop.name} for ${crop.sellPrice} coins`}
                      onClick={(event) => {
                        event.stopPropagation();
                        sellPlant(plant.tileId);
                      }}
                    >
                      <img
                        className="cropSprite"
                        src={cropImage}
                        alt=""
                        draggable="false"
                      />
                      <span className="cropSellTag">Sell +{crop.sellPrice}</span>
                    </button>
                  );
                }

                return (
                  <div
                    className="farmCrop"
                    key={plant.tileId}
                    style={cropStyle}
                    title={`${crop.name}, growth stage ${plant.stage}`}
                  >
                    {plant.stage === 0 ? (
                      <span className="cropSeeds" aria-label="Seed planted">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <img
                        className="cropSprite"
                        src={cropImage}
                        alt=""
                        draggable="false"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className={`farmShopStall ${isNearFarmShop ? "farmShopNearby" : ""}`}
              style={{
                left: `${farmShopPosition.x}%`,
                top: `${farmShopPosition.y}%`,
              }}
              disabled={!isNearFarmShop || showShop}
              aria-label={
                isNearFarmShop
                  ? "Open farm shop"
                  : "Farm shop. Walk closer to open"
              }
              onClick={(event) => {
                event.stopPropagation();
                setShopSection("seeds");
                setShopMessage("");
                setShowShop(true);
              }}
            >
              <img src={farmTent} alt="" draggable="false" />
              <span className="farmShopLabel" aria-hidden="true">
                {isNearFarmShop ? "Press E · Seeds" : "Linus' Seed Tent"}
              </span>
            </button>
            <div
              className="seedInventory"
              onClick={(event) => event.stopPropagation()}
            >
              <strong>Seeds</strong>
              <div className="seedInventoryItems">
                {Array.from({ length: maxSeedInventory }, (_, slotIndex) => {
                  const inventorySeed = seedInventory[slotIndex];
                  const seed = inventorySeed
                    ? plantCatalog[inventorySeed.type]
                    : null;

                  return seed ? (
                    <button
                      key={inventorySeed.id}
                      type="button"
                      className={
                        selectedSeedId === inventorySeed.id
                          ? "selectedSeed"
                          : ""
                      }
                      aria-label={`${seed.name} seed`}
                      aria-pressed={selectedSeedId === inventorySeed.id}
                      title={`${seed.name} Seed`}
                      onClick={() => {
                        setSelectedSeedId(inventorySeed.id);
                        setFarmMessage(
                          `Move to a clear spot, then click the farm to plant ${seed.name}.`
                        );
                      }}
                    >
                      <img src={seed.stages[0]} alt="" draggable="false" />
                    </button>
                  ) : (
                    <div
                      className="emptySeedSlot"
                      key={`empty-${slotIndex}`}
                      aria-label="Empty seed slot"
                    />
                  );
                })}
              </div>
              {seedInventory.length === 0 && (
                <span className="inventoryHint">Buy seeds at the tent</span>
              )}
              {selectedSeed && (
                <span>Move to a clear spot, then click the farm to plant</span>
              )}
              {farmMessage && (
                <span className="farmMessage" role="status">
                  {farmMessage}
                </span>
              )}
            </div>
            {plantAnnouncement && (
              <div
                key={plantAnnouncement.id}
                className="plantAnnouncement"
                role="status"
              >
                {plantAnnouncement.message}
              </div>
            )}
            {quizCompletionAnnouncement && (
              <div
                key={quizCompletionAnnouncement.id}
                className="quizCompletionAnnouncement"
                role="status"
              >
                {quizCompletionAnnouncement.message}
              </div>
            )}
            <div
              className={`studyPlayer ${theme} ${isPlayerMoving ? "moving" : "idle"}`}
              style={{
                left: `${playerPosition.x}%`,
                top: `${playerPosition.y}%`,
                "--harvey-sprite": `url("${harveySpriteSheet}")`,
              }}
              role="img"
              aria-label={`Harvey${isPlayerMoving ? " moving" : ""}`}
            />
            <div
              className={`studyStageContent ${
                hasBoughtFirstSeed && !hasStarted && !quizComplete
                  ? "fading"
                  : ""
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              {hasStarted ? (
                <>
                  <h2>Study Quiz 📚</h2>
                  <p>
                    Question {usedQuestionCount} of {quizQuestions.length}
                  </p>
                  <p className="movementHint">Move with W A S D</p>
                </>
              ) : quizComplete ? (
                <>
                  <h2>Quiz complete! 🎉</h2>
                  <p>You reviewed all {quizQuestions.length} questions.</p>
                  <button onClick={startQuiz}>Try Again ✨</button>
                  <p className="movementHint">Move with W A S D</p>
                </>
              ) : quizPaused ? (
                <>
                  <h2>Quiz paused</h2>
                  <p>
                    Progress saved at question {usedQuestionCount} of{" "}
                    {quizQuestions.length}.
                  </p>
                  <button onClick={resumeQuiz}>Resume Quiz</button>
                </>
              ) : (
                !quizComplete && (
                  <div className="farmInstructions">
                    <p>Move with W A S D</p>
                    <p>
                      Buy seeds at Linus' seed tent and sell crops to buy image
                      rewards.
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
          {hasStarted && correctAnswerCount < 5 && (
            <button className="endQuizButton" onClick={backToSetup}>
              End Quiz
            </button>
          )}
        </section>
      </main>

      <div className="economyHud">
        <span className="coinBalance" aria-live="polite">
          🪙 {coins} coins
        </span>
        <div className="economyActions">
          <button
            type="button"
            className="rewardShopButton"
            onClick={() => {
              setShopSection("rewards");
              setShopMessage("");
              setShowShop(true);
            }}
          >
            Image Rewards
          </button>
          <button
            type="button"
            className="photoAlbumButton"
            onClick={() => {
              setPhotoAlbumMessage("");
              setShowPhotoAlbum(true);
            }}
          >
            Photo Album ({ownedRewardImages.length})
          </button>
        </div>
      </div>

      {equippedRewardImage && (
        <div className="equippedReward">
          <img src={equippedRewardImage.src} alt={equippedRewardImage.name} />
          <span>{equippedRewardImage.name}</span>
        </div>
      )}

      {showShop && (
        <div className="modalOverlay shopOverlay">
          <section
            className="shopCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shopTitle"
          >
            <header className="shopHeader">
              <div>
                <h2 id="shopTitle">
                  {shopSection === "seeds" ? "Linus' Seed Tent" : "Image Reward Shop"}
                </h2>
                <p>
                  Coins: {coins} 🪙 · Earn up to {quizCoinBudget} coins per quiz
                  by answering correctly.
                </p>
              </div>
              <button
                type="button"
                className="closeShopButton"
                aria-label="Close shop"
                onClick={() => setShowShop(false)}
              >
                ×
              </button>
            </header>

            {shopMessage && (
              <p className="shopMessage" role="status">
                {shopMessage}
              </p>
            )}

            {shopSection === "seeds" ? (
              <>
                <h3>Seeds</h3>
                <div className="shopGrid seedShopGrid">
                  {plantCatalog.map((seed) => (
                    <article className="shopItem" key={seed.type}>
                      <img src={seed.stages[0]} alt="" />
                      <h4>{seed.name} Seed</h4>
                      <p>Sell grown crop for {seed.sellPrice} coins</p>
                      <button
                        type="button"
                        disabled={
                          coins < seed.seedPrice ||
                          seedInventory.length >= maxSeedInventory
                        }
                        onClick={() => buySeed(seed.type)}
                      >
                        {seedInventory.length >= maxSeedInventory
                          ? "Inventory Full"
                          : `Buy Seed · ${seed.seedPrice} 🪙`}
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3>Reward Images</h3>
                <div className="shopGrid rewardShopGrid">
                  {rewardImages.map((reward) => {
                    const isOwned = ownedRewardImages.includes(reward.id);
                    return (
                      <article
                        className="shopItem rewardShopItem"
                        key={reward.id}
                      >
                        <img src={reward.src} alt={reward.name} />
                        <h4>{reward.name}</h4>
                        <button
                          type="button"
                          disabled={
                            isOwned
                              ? equippedRewardImageId === reward.id
                              : coins < reward.price
                          }
                          onClick={() => buyOrEquipReward(reward)}
                        >
                          {isOwned
                            ? equippedRewardImageId === reward.id
                              ? "Equipped"
                              : "Equip"
                            : `Buy · ${reward.price} 🪙`}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {showPhotoAlbum && (
        <div className="modalOverlay photoAlbumOverlay">
          <section
            className="photoAlbumCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="photoAlbumTitle"
          >
            <header className="shopHeader">
              <div>
                <h2 id="photoAlbumTitle">Reward Photo Album</h2>
                <p>Your purchased reward images.</p>
              </div>
              <button
                type="button"
                className="closeShopButton"
                aria-label="Close photo album"
                onClick={() => setShowPhotoAlbum(false)}
              >
                ×
              </button>
            </header>
            {photoAlbumMessage && (
              <p className="shopMessage" role="status">
                {photoAlbumMessage}
              </p>
            )}
            {ownedRewardImages.length === 0 ? (
              <p className="photoAlbumEmpty">
                You haven’t purchased any reward images yet. Visit Image Rewards
                to add one to your album.
              </p>
            ) : (
              <div className="photoAlbumGrid">
                {ownedRewardImages.map((rewardId) => {
                  const reward = rewardImages.find(
                    (image) => image.id === rewardId
                  );
                  if (!reward) return null;

                  return (
                    <article className="photoAlbumItem" key={reward.id}>
                      <button
                        type="button"
                        className="photoAlbumImageButton"
                        aria-label={`View ${reward.name} full size`}
                        onClick={() => setViewingRewardImageId(reward.id)}
                      >
                        <img src={reward.src} alt={reward.name} />
                      </button>
                      <h3>{reward.name}</h3>
                      <button
                        type="button"
                        className="setIconButton"
                        disabled={equippedIconRewardId === reward.id}
                        onClick={() => setRewardAsIcon(reward)}
                      >
                        {equippedIconRewardId === reward.id
                          ? "Current Icon"
                          : "Set as Icon"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
            {equippedIconRewardId !== null && (
              <button
                type="button"
                className="restoreThemeIconButton"
                onClick={() => {
                  setEquippedIconRewardId(null);
                  setPhotoAlbumMessage("Using the selected theme icon again.");
                }}
              >
                Use Harvey / Melody Icon
              </button>
            )}
          </section>
        </div>
      )}

      {viewingRewardImage && (
        <div className="modalOverlay rewardViewerOverlay">
          <section
            className="rewardViewerCard"
            role="dialog"
            aria-modal="true"
            aria-label={`${viewingRewardImage.name} full-size view`}
          >
            <button
              type="button"
              className="closeShopButton rewardViewerClose"
              aria-label="Close full-size image"
              onClick={() => setViewingRewardImageId(null)}
            >
              ×
            </button>
            <img
              className="rewardViewerImage"
              src={viewingRewardImage.src}
              alt={viewingRewardImage.name}
            />
            <h2>{viewingRewardImage.name}</h2>
            <button
              type="button"
              className="setIconButton"
              disabled={equippedIconRewardId === viewingRewardImage.id}
              onClick={() => setRewardAsIcon(viewingRewardImage)}
            >
              {equippedIconRewardId === viewingRewardImage.id
                ? "Current Icon"
                : "Set as Icon"}
            </button>
          </section>
        </div>
      )}

      <QuizModal
        key={`${questionIndex}-${showQuiz}`}
        open={showQuiz}
        question={currentQuestion}
        onAnswer={handleAnswer}
        feedback={feedback}
        currentNumber={usedQuestionCount}
        totalQuestions={quizQuestions.length}
        correctAnswerCount={correctAnswerCount}
        onPause={pauseQuiz}
      />

      <div className={`themeParticles ${theme}`}>
        {[...Array(12)].map((_, index) => (
          <img
            key={index}
            src={icon}
            className={`particle p${index}`}
            alt=""
          />
        ))}
      </div>

      <div className="sparkles">
        <span>✨</span>
        <span>💖</span>
        <span>⭐</span>
        <span>🌸</span>
        <span>✨</span>
      </div>
    </>
  );
}

export default App;