let video;
let bodySegmentation;
let handPose;
let results;
let hands = [];

// Session State
let isCountingDown = false;
let isSessionActive = false;
let timerStart = 0;
let photosTakenInSession = 0;
let photoBatch = [];

// Wall Frames
let frames = [];

function preload() {
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

    // Initialize 4 Frames (Adjust x, y, w, h to fit your projector wall)
    let fw = 300;
    let fh = 225;
    frames.push({ x: width * 0.2 - fw / 2, y: height * 0.3 - fh / 2, w: fw, h: fh, occupied: false, images: [] });
    frames.push({ x: width * 0.8 - fw / 2, y: height * 0.3 - fh / 2, w: fw, h: fh, occupied: false, images: [] });
    frames.push({ x: width * 0.2 - fw / 2, y: height * 0.7 - fh / 2, w: fw, h: fh, occupied: false, images: [] });
    frames.push({ x: width * 0.8 - fw / 2, y: height * 0.7 - fh / 2, w: fw, h: fh, occupied: false, images: [] });
}

function draw() {
    background(0);

    // 1. GESTURE CHECK
    checkFiveGesture();

    // 2. LIVE CAMERA LAYER (Mirrored)
    push();
    translate(width, 0);
    scale(-1, 1);
    if (results && results.mask) {
        let maskedImage = video.get();
        maskedImage.mask(results.mask);
        image(maskedImage, 0, 0, width, height);
    }
    pop();

    // 3. WALL FRAMES & HOVER ANIMATION
    for (let f of frames) {
        // Draw Frame Placeholder
        noFill();
        stroke(255, 50);
        rect(f.x, f.y, f.w, f.h);

        if (f.occupied) {
            let isHovering = false;
            if (hands.length > 0) {
                let tip = hands[0].keypoints[8];
                let hX = width - map(tip.x, 0, 640, 0, width);
                let hY = map(tip.y, 0, 480, 0, height);
                if (hX > f.x && hX < f.x + f.w && hY > f.y && hY < f.y + f.h) isHovering = true;
            }

            // Choose image: Cycle if hovering, otherwise show first
            let imgToDisplay = isHovering ? f.images[floor(frameCount / 10) % 3] : f.images[0];
            image(imgToDisplay, f.x, f.y, f.w, f.h);
        }
    }

    // 4. UI: COUNTDOWN & SESSION INFO
    if (isCountingDown) {
        let elapsed = millis() - timerStart;
        let sec = 3 - floor(elapsed / 1000);

        if (sec > 0) {
            textAlign(CENTER, CENTER);
            fill(255, 200, 0);
            textSize(200);
            text(sec, width / 2, height / 2);
            textSize(40);
            text("GET READY: PHOTO " + (photosTakenInSession + 1) + " / 3", width / 2, height / 2 + 120);
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
        background(255); // Flash

        if (photoBatch.length < 3) {
            // Wait 1.5 seconds before starting next countdown
            setTimeout(startCountdown, 1500);
        } else {
            // Session Complete
            assignToFrame(photoBatch);
            isSessionActive = false;
        }
    }
}

function assignToFrame(batch) {
    // Find the first empty frame
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