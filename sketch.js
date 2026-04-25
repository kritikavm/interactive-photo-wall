let video;
let bodySegmentation;
let handPose;
let results;
let hands = [];

let wallImage;
let isCountingDown = false;
let isSessionActive = false;
let timerStart = 0;
let photosTakenInSession = 0;
let photoBatch = [];
let frames = [];

function preload() {
    // Ensure this matches your file name exactly!
    wallImage = loadImage('gallery_image.png');
    bodySegmentation = ml5.bodySegmentation("SelfieSegmentation", { maskType: "background" });
    handPose = ml5.handPose();
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    video = createCapture(VIDEO);
    video.size(640, 480);
    video.hide();

    bodySegmentation.detectStart(video, (res) => { results = res; });
    handPose.detectStart(video, (res) => { hands = res; });

    // --- TUNE THESE NUMBERS ---
    // Change these x, y, w, h values until the red debug boxes 
    // sit perfectly inside your golden frames.
    frames.push({ x: width * 0.23, y: height * 0.05, w: width * 0.28, h: height * 0.33, occupied: false, images: [] });
    frames.push({ x: width * 0.72, y: height * 0.22, w: width * 0.24, h: height * 0.43, occupied: false, images: [] });
    frames.push({ x: width * 0.03, y: height * 0.45, w: width * 0.23, h: height * 0.48, occupied: false, images: [] });
    frames.push({ x: width * 0.36, y: height * 0.52, w: width * 0.27, h: height * 0.35, occupied: false, images: [] });
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
        imageMode(CORNER);
        image(wallImage, 0, 0, width, height);

        // LAYER 3: STORED PHOTOS & HOVER LOGIC
        for (let f of frames) {
            let isHovering = false;

            if (hands.length > 0) {
                let tip = hands[0].keypoints[8];
                // Map camera 640x480 to screen size
                let hX = width - map(tip.x, 0, 640, 0, width);
                let hY = map(tip.y, 0, 480, 0, height);

                // --- THE GREEN DOT ---
                // We draw this once per hand outside the loop if we wanted, 
                // but drawing it here ensures it's on top of the wall.
                fill(0, 255, 0);
                noStroke();
                circle(hX, hY, 15);

                // Check if the mapped finger is inside the frame bounds
                if (hX > f.x && hX < f.x + f.w && hY > f.y && hY < f.y + f.h) {
                    isHovering = true;
                }
            }

            if (f.occupied) {
                // GIF Logic: Cycle 3 images if hovering, otherwise static
                let imgToDisplay = isHovering ? f.images[floor(frameCount / 10) % 3] : f.images[0];
                image(imgToDisplay, f.x, f.y, f.w, f.h);
            }
        }
    }

    // LAYER 4: UI COUNTDOWN
    if (isCountingDown) {
        let elapsed = millis() - timerStart;
        let sec = 3 - floor(elapsed / 1000);

        if (sec > 0) {
            textAlign(CENTER, CENTER);
            fill(255, 200, 0);
            textSize(250);
            text(sec, width / 2, height / 2);

            textSize(40);
            fill(255);
            text("PHOTO " + (photosTakenInSession + 1) + " / 3", width / 2, height / 2 + 150);
        } else {
            takePhoto();
            isCountingDown = false;
        }
    }
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
            isSessionActive = false; // The wall will reappear now!
        }
    }
}

function assignToFrame(batch) {
    // Look for the first empty frame to fill
    for (let f of frames) {
        if (!f.occupied) {
            f.images = batch;
            f.occupied = true;
            break;
        }
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}