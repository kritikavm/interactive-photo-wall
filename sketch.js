let video;
let bodySegmentation;
let results;
let handPose;
let hands = [];
let isCountingDown = false;
let timerStart = 0;
let photos = []; // We will store our "taken" photos here

// Options for the segmentation model
let options = {
    maskType: "background", // We want to isolate the person
};

function preload() {
    bodySegmentation = ml5.bodySegmentation("SelfieSegmentation", options);
    // NEW: Load HandPose
    handPose = ml5.handPose();
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    video = createCapture(VIDEO);
    video.size(640, 480);
    video.hide();

    bodySegmentation.detectStart(video, gotResults);
    // NEW: Start Hand Detection
    handPose.detectStart(video, gotHands);
    imageMode(CORNER); // This is default, but let's be sure
}

function draw() {
    background(0); // The "dark room" base

    // 1. GESTURE CHECK
    // We run this first to see if we should start the timer
    checkFiveGesture();

    // 2. LIVE CAMERA LAYER (The Mirror)
    push();
    translate(width, 0);
    scale(-1, 1); // Mirror the world

    if (results && results.mask) {
        let maskedImage = video.get();
        maskedImage.mask(results.mask);

        // Draw your live self
        image(maskedImage, 0, 0, width, height);
    }
    pop();

    // 3. CAPTURED PHOTOS LAYER (The Environment)
    // These stay on top of the live video so they feel like "stickers" in the room
    for (let p of photos) {

        // Interaction: Repel from hands
        for (let hand of hands) {
            let indexTip = hand.keypoints[8];

            // MAP the coordinates from video size (640x480) to canvas size
            let handX = map(indexTip.x, 0, 640, 0, width);
            let handY = map(indexTip.y, 0, 480, 0, height);

            // Flip the hand X because the video was mirrored
            let flippedHandX = width - handX;

            let d = dist(flippedHandX, handY, p.x + (p.size / 2), p.y + (p.size / 2));

            // 1. Shrink the radius (Change 300 to 100 or 150)
            // This means your finger has to be almost touching the photo to move it.
            if (d < 150) {
                let forceX = (p.x + (p.size / 2)) - flippedHandX;
                let forceY = (p.y + (p.size / 2)) - handY;

                // 2. Increase the "Oomph" (Change 0.1 to 0.4)
                // Since you're closer, you want it to move faster when it finally reacts.
                p.vx += forceX * 0.4;
                p.vy += forceY * 0.4;
            }
        }

        // Physics: Friction, Movement, and Walls
        p.vx *= 0.95; // Friction makes them stop eventually
        p.vy *= 0.95;
        p.x += p.vx;
        p.y += p.vy;

        // Bounce logic
        if (p.x < 0 || p.x > width - p.size) p.vx *= -1;
        if (p.y < 0 || p.y > height - (p.size * 0.75)) p.vy *= -1;

        // Draw the actual photo
        image(p.image, p.x, p.y, p.size, (p.size * 480) / 640);
    }

    // 4. UI LAYER (Countdown)
    // This is drawn last so it appears over EVERYTHING
    if (isCountingDown) {
        let elapsed = millis() - timerStart;
        let countdown = 3 - floor(elapsed / 1000);

        if (countdown > 0) {
            fill(255, 200, 0); // Bold Orange
            textSize(250);
            textAlign(CENTER, CENTER);
            text(countdown, width / 2, height / 2);
        } else {
            // Time is up!
            takePhoto();
            isCountingDown = false;
        }
    }
    if (hands.length > 0) {
        let tip = hands[0].keypoints[8];
        let debugX = width - map(tip.x, 0, 640, 0, width);
        let debugY = map(tip.y, 0, 480, 0, height);
        fill(255, 0, 0);
        noStroke();
        circle(debugX, debugY, 20);
    }
}

function takePhoto() {
    console.log("SNAP!");

    if (results && results.mask) {
        // 1. Create a snapshot of the current video frame
        let img = video.get();

        // 2. Apply the AI mask to this specific snapshot
        img.mask(results.mask);

        // 3. Create the "Photo Object"
        let newPhoto = {
            image: img,
            x: random(100, width - 300),
            y: random(100, height - 300),
            vx: random(-2, 2), // Start with a little "pop" of movement
            vy: random(-2, 2),
            size: 300
        };

        // 4. Add it to the array so the draw() loop starts rendering it
        photos.push(newPhoto);

        // 5. Visual feedback: Flash the background white for a split second
        background(255);
    }
}

function gotResults(result) {
    // In the new version, result is an object containing the mask
    results = result;
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function gotHands(results) {
    hands = results;
}

function checkFiveGesture() {
    if (hands.length > 0 && !isCountingDown) {
        let hand = hands[0];

        // 1. Check if the 4 fingers are extended (Tip is above Joint)
        let indexUp = hand.keypoints[8].y < hand.keypoints[6].y;
        let middleUp = hand.keypoints[12].y < hand.keypoints[10].y;
        let ringUp = hand.keypoints[16].y < hand.keypoints[14].y;
        let pinkyUp = hand.keypoints[20].y < hand.keypoints[18].y;

        // 2. Check if the thumb is extended OUTWARD
        // We measure the horizontal distance between Thumb Tip (4) and Index Base (5)
        let thumbDistance = abs(hand.keypoints[4].x - hand.keypoints[5].x);
        let thumbIsOut = thumbDistance > 50; // Adjust this number if it's too sensitive

        // 3. Trigger ONLY if all four fingers are up AND the thumb is stretched out
        if (indexUp && middleUp && ringUp && pinkyUp && thumbIsOut) {
            isCountingDown = true;
            timerStart = millis();
        }
    }
}