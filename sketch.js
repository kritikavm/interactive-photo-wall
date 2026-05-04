let video;
let bodySegmentation;
let handPose;
let results;
let hands = [];

// Base wall & Foreground 
let wallImage;
let staircaseImage; // --- NEW: Variable for the staircase foreground ---

let isCountingDown = false;
let isSessionActive = false;
let timerStart = 0;
let photosTakenInSession = 0;
let photoBatch = [];
let frames = [];

// --- Arrays to hold the split frame images ---
let frameBGs = []; // The back of the frames
let frameFGs = []; // The front of the frames (with transparent centers)

// --- Frame cycling logic ---
let nextFrameIndex = 0;

// --- WAND & SPARKLE VARIABLES ---
let num_of_sparkles = 1000;
let sparklesX = [];
let sparklesY = [];
let sparklesTime = [];
let gravity = 0.3;
let currentclick = 0;
let wand;

function preload() {
    wallImage = loadImage('gallery_image.png'); // This is now just the plain wall background
    staircaseImage = loadImage('staircase.png'); // --- NEW: Load the staircase ---
    wand = loadImage('wand.png');

    // =========================================================
    // ⚠️ IMPORTANT: UPDATE THESE 8 FILE NAMES TO MATCH YOURS ⚠️
    // =========================================================
    frameBGs[0] = loadImage('./frame_background/Background 1.png');
    frameFGs[0] = loadImage('./frame_background/Frame 1.png'); // Must be a PNG with transparent center

    frameBGs[1] = loadImage('./frame_background/Background 2.png');
    frameFGs[1] = loadImage('./frame_background/Frame 2.png'); // Must be a PNG with transparent center

    frameBGs[2] = loadImage('./frame_background/Background 3.png');
    frameFGs[2] = loadImage('./frame_background/Frame 3.png'); // Must be a PNG with transparent center

    frameBGs[3] = loadImage('./frame_background/Background 4.png');
    frameFGs[3] = loadImage('./frame_background/Frame 4.png'); // Must be a PNG with transparent center
    // =========================================================

    bodySegmentation = ml5.bodySegmentation("SelfieSegmentation", { maskType: "background" });
    handPose = ml5.handPose();
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    video = createCapture(VIDEO);
    video.size(640, 480);
    video.hide();

    // Initialize sparkles off-screen with a time of 0
    for (let i = 0; i < num_of_sparkles; i++) {
        sparklesX[i] = -1000;
        sparklesY[i] = -1000;
        sparklesTime[i] = 0;
    }

    bodySegmentation.detectStart(video, (res) => { results = res; });
    handPose.detectStart(video, (res) => { hands = res; });

    // --- FRAME POSITIONS ---
    // Frame 1: Top-Left corner
    frames.push({ x: (width * 0.05) + 50, y: (height * 0.05) + 75, w: width * 0.22, h: height * 0.35, bgImg: frameBGs[0], fgImg: frameFGs[0], occupied: false, images: [] });

    // Frame 2: Mid-Left 
    frames.push({ x: width * 0.10, y: (height * 0.45) + 75, w: width * 0.20, h: height * 0.32, bgImg: frameBGs[1], fgImg: frameFGs[1], occupied: false, images: [] });

    // Frame 3: Top-Middle 
    frames.push({ x: width * 0.32, y: (height * 0.15) + 75, w: width * 0.24, h: height * 0.38, bgImg: frameBGs[2], fgImg: frameFGs[2], occupied: false, images: [] });

    // Frame 4: Top-Right 
    frames.push({ x: width * 0.60, y: (height * 0.05) + 75, w: width * 0.20, h: height * 0.32, bgImg: frameBGs[3], fgImg: frameFGs[3], occupied: false, images: [] });
}

function draw() {
    background(0);

    checkFiveGesture();

    // LAYER 1: LIVE SELF (The Mirror)
    push();
    translate(width, 0);
    scale(-1, 1);
    if (results && results.mask) {
        let maskedImage = video.get();
        maskedImage.mask(results.mask);
        image(maskedImage, 0, 0, width, height);
    }
    pop();

    // LAYER 2: THE WALL (Only shows when not taking photos)
    if (!isSessionActive) {
        // 1. Draw the base wallpaper FIRST
        imageMode(CORNER);
        image(wallImage, 0, 0, width, height);

        // 2. Draw the SANDWICH FRAMES & HOVER LOGIC
        for (let f of frames) {
            let isHovering = false;

            if (hands.length > 0) {
                let tip = hands[0].keypoints[8];
                let hX = width - map(tip.x, 0, 640, 0, width);
                let hY = map(tip.y, 0, 480, 0, height);

                if (hX > f.x && hX < f.x + f.w && hY > f.y && hY < f.y + f.h) {
                    isHovering = true;
                }
            }

            // Draw the back of the frame
            image(f.bgImg, f.x, f.y, f.w, f.h);

            // Draw the photo (sandwiched in the middle, shifted up 50px)
            if (f.occupied) {
                let imgToDisplay = isHovering ? f.images[floor(frameCount / 10) % 3] : f.images[0];
                image(imgToDisplay, f.x, f.y - 25, f.w, f.h);
            }

            // Draw the front of the frame (overlaying the edges of the photo)
            image(f.fgImg, f.x, f.y, f.w, f.h);
        }

        // --- NEW LAYER 2.5: THE FOREGROUND STAIRCASE ---
        // By drawing this AFTER the frames, it covers up any frames/photos underneath it
        image(staircaseImage, 0, height * 0.3, width, height);

        // LAYER 3.5: FALLING SPARKLES (Drawn over everything)
        noStroke();
        let currentGreen = random(230, 255);
        let currentBlue = random(100, 200);

        for (let i = 0; i < num_of_sparkles; i++) {
            let age = millis() - sparklesTime[i];

            if (sparklesY[i] > -100 && sparklesY[i] < height + 50 && age < 5000) {
                let alpha = map(age, 0, 5000, 255, 0);
                let sSize = random(2, 6);

                // Glow
                fill(255, currentGreen, currentBlue, alpha * 0.5);
                ellipse(sparklesX[i], sparklesY[i], sSize * 2.5, sSize * 2.5);

                // Core
                fill(255, 255, 255, alpha);
                ellipse(sparklesX[i], sparklesY[i], sSize, sSize);

                sparklesY[i] += gravity;
            }
        }

        // LAYER 4: DRAW WAND AND EMIT NEW SPARKLES
        if (hands.length > 0) {
            let tip = hands[0].keypoints[8];
            let hX = width - map(tip.x, 0, 640, 0, width);
            let hY = map(tip.y, 0, 480, 0, height);

            imageMode(CORNER);
            image(wand, hX - 50, hY - 62);

            sparklesX[currentclick] = hX - 50;
            sparklesY[currentclick] = hY - 62;
            sparklesTime[currentclick] = millis();

            currentclick += 1;
            if (currentclick >= num_of_sparkles) {
                currentclick = 0;
            }
        }
    }

    // LAYER 5: UI COUNTDOWN & CANCEL BUTTON
    if (isSessionActive) {
        push();
        fill(255, 0, 0);
        noStroke();
        rectMode(CENTER);
        rect(width / 2, 60, 150, 50, 10);

        fill(255);
        textAlign(CENTER, CENTER);
        textSize(24);
        text("Cancel", width / 2, 60);
        pop();

        if (isCountingDown) {
            let elapsed = millis() - timerStart;
            let sec = 3 - floor(elapsed / 1000);

            if (sec > 0) {
                push();
                textAlign(CENTER, CENTER);
                fill(255, 200, 0);
                textSize(250);
                text(sec, width / 2, height / 2);

                textSize(40);
                fill(255);
                text("PHOTO " + (photosTakenInSession + 1) + " / 3", width / 2, height / 2 + 150);
                pop();
            } else {
                takePhoto();
                isCountingDown = false;
            }
        }
    }
}

function mousePressed() {
    if (isSessionActive) {
        let btnLeft = (width / 2) - 75;
        let btnRight = (width / 2) + 75;
        let btnTop = 60 - 25;
        let btnBottom = 60 + 25;

        if (mouseX > btnLeft && mouseX < btnRight && mouseY > btnTop && mouseY < btnBottom) {
            cancelSession();
        }
    }
}

function cancelSession() {
    isSessionActive = false;
    isCountingDown = false;
    photosTakenInSession = 0;
    photoBatch = [];
}

function checkFiveGesture() {
    if (hands.length > 0 && !isCountingDown && !isSessionActive) {
        let hand = hands[0];
        let indexUp = hand.keypoints[8].y < hand.keypoints[6].y;
        let middleUp = hand.keypoints[12].y < hand.keypoints[10].y;
        let ringUp = hand.keypoints[16].y < hand.keypoints[14].y;
        let pinkyUp = hand.keypoints[20].y < hand.keypoints[18].y;
        let thumbOut = abs(hand.keypoints[4].x - hand.keypoints[5].x) > 50;

        if (indexUp && middleUp && ringUp && pinkyUp && thumbOut) {
            isSessionActive = true;
            photosTakenInSession = 0;
            photoBatch = [];
            startCountdown();
        }
    }
}

function startCountdown() {
    isCountingDown = true;
    timerStart = millis();
}

function takePhoto() {
    if (!isSessionActive) return;

    if (results && results.mask) {
        let img = video.get();
        img.mask(results.mask);
        photoBatch.push(img);
        background(255);

        if (photoBatch.length < 3) {
            setTimeout(startCountdown, 1500);
            photosTakenInSession++;
        } else {
            assignToFrame(photoBatch);
            isSessionActive = false;
        }
    }
}

function assignToFrame(batch) {
    frames[nextFrameIndex].images = batch;
    frames[nextFrameIndex].occupied = true;
    nextFrameIndex = (nextFrameIndex + 1) % frames.length;
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}