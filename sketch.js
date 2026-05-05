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

// --- ELEMENT PANEL VARIABLES ---
let showElementPanel = false;
let elementImages = [];    // { img, label }
let activeElement = null;  // { img, label, w, h } — follows fingertip
let placedElements = [];   // { img, x, y, w, h } — permanently on wall
const PANEL_W  = 220;
const ITEM_GAP = 12;  // gap between cards
const LABEL_H  = 22;  // label below thumbnail

// --- GESTURE STATE ---
let wasPinching   = false;
let lastPinchTime = 0;
const PINCH_THRESHOLD = 55;
const PINCH_COOLDOWN  = 1100;

// --- DWELL (hover-to-pick-up) STATE ---
let hoverElementIndex = -1;
let hoverStartTime    = 0;
const DWELL_TIME      = 900;

// --- PANEL SCROLL STATE ---
let panelScrollY      = 0;
let lastFingerYPanel  = -1;

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

    // --- ELEMENT IMAGES ---
    elementImages[0] = { img: loadImage('./elements/hat.png'),   label: 'Hat' };
    elementImages[1] = { img: loadImage('./elements/owl.png'),   label: 'Owl' };
    elementImages[2] = { img: loadImage('./elements/train.png'), label: 'Train' };

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
    checkGestures();

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

        // --- LAYER 2.6: PLACED ELEMENTS (on top of staircase so always visible) ---
        imageMode(CORNER);
        for (let el of placedElements) {
            image(el.img, el.x - el.w / 2, el.y - el.h / 2, el.w, el.h);
        }

        // --- LAYER 2.7: ACTIVE ELEMENT — follows index fingertip ---
        if (activeElement && hands.length > 0) {
            let tip = hands[0].keypoints[8];
            let hX  = width - map(tip.x, 0, 640, 0, width);
            let hY  = map(tip.y,          0, 480, 0, height);

            imageMode(CORNER);
            image(activeElement.img, hX - activeElement.w / 2, hY - activeElement.h / 2, activeElement.w, activeElement.h);
        }

        // --- LAYER 2.8: ELEMENT PANEL ---
        if (showElementPanel) {
            drawElementPanel();
        }

        // --- LAYER 2.9: ADD ELEMENTS BUTTON ---
        drawAddElementsButton();

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
    // Session cancel button (kept as a safety fallback during photo sessions)
    if (isSessionActive) {
        let btnLeft   = (width / 2) - 75;
        let btnRight  = (width / 2) + 75;
        let btnTop    = 60 - 25;
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
    if (hands.length > 0 && !isCountingDown && !isSessionActive && !showElementPanel && !activeElement) {
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

function checkGestures() {
    if (isSessionActive || hands.length === 0) {
        wasPinching      = false;
        hoverElementIndex = -1;
        lastFingerYPanel  = -1;
        return;
    }

    let tip   = hands[0].keypoints[8];
    let thumb = hands[0].keypoints[4];
    let hX = width - map(tip.x,   0, 640, 0, width);
    let hY = map(tip.y,            0, 480, 0, height);
    let tX = width - map(thumb.x,  0, 640, 0, width);
    let tY = map(thumb.y,           0, 480, 0, height);

    let pinching  = dist(hX, hY, tX, tY) < PINCH_THRESHOLD;
    let pinchEdge = pinching && !wasPinching && (millis() - lastPinchTime > PINCH_COOLDOWN);

    // ── Pinch: context-sensitive action ─────────────────────────
    if (pinchEdge) {
        if (activeElement) {
            placeElement(hX, hY);
        } else if (!showElementPanel) {
            showElementPanel = true;
            panelScrollY     = 0;
        } else {
            showElementPanel  = false;
            hoverElementIndex = -1;
        }
        lastPinchTime = millis();
    }
    wasPinching = pinching;

    let panelX  = width - PANEL_W - 5;
    let panelY  = 70;
    let panelH  = height - 80;
    let headerH = 54;

    // ── Panel scroll via finger drag ─────────────────────────────
    if (showElementPanel && !activeElement && hX > panelX) {
        if (lastFingerYPanel >= 0) {
            let delta = lastFingerYPanel - hY; // up = positive = scroll down
            if (abs(delta) > 1.5) {
                panelScrollY = constrain(panelScrollY + delta, 0, maxPanelScroll());
            }
        }
        lastFingerYPanel = hY;
    } else {
        lastFingerYPanel = -1;
    }

    // ── Dwell to pick up element ─────────────────────────────────
    if (showElementPanel && !activeElement && !pinching) {
        let thumbW  = PANEL_W - 28;
        let startY  = panelY + headerH;

        let found = -1;
        for (let i = 0; i < elementImages.length; i++) {
            let ty  = startY + itemOffset(i) - panelScrollY + 8;
            let tH  = thumbH(i);
            if (ty + tH < panelY + headerH) continue;
            if (ty > panelY + panelH)       continue;
            if (hX > panelX + 14 && hX < panelX + 14 + thumbW &&
                hY > ty          && hY < ty + tH) {
                found = i;
                break;
            }
        }

        if (found !== hoverElementIndex) {
            hoverElementIndex = found;
            hoverStartTime    = millis();
        }

        if (hoverElementIndex >= 0 && millis() - hoverStartTime >= DWELL_TIME) {
            let idx = hoverElementIndex;
            let placedW = 120;
            let placedH = placedW * elementImages[idx].img.height / elementImages[idx].img.width;
            activeElement = {
                img:   elementImages[idx].img,
                label: elementImages[idx].label,
                w: placedW,
                h: placedH
            };
            hoverElementIndex = -1;
        }
    } else if (!showElementPanel || pinching) {
        hoverElementIndex = -1;
    }
}

// Height of a single thumbnail scaled to fit the panel width
function thumbH(i) {
    let tw  = PANEL_W - 28;
    let img = elementImages[i].img;
    if (!img || img.width === 0) return 150;
    return tw * img.height / img.width;
}

// Y offset (within scrollable area) of element i, relative to startY
function itemOffset(i) {
    let off = 0;
    for (let j = 0; j < i; j++) off += thumbH(j) + ITEM_GAP + LABEL_H;
    return off;
}

function maxPanelScroll() {
    let headerH  = 54;
    let panelH   = height - 80;
    let contentH = itemOffset(elementImages.length) + 16;
    return max(0, contentH - (panelH - headerH));
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

// ─── ELEMENT PANEL HELPERS ────────────────────────────────────────────────────

function drawAddElementsButton() {
    let label;
    if (activeElement)       label = '✶  Pinch to place';
    else if (showElementPanel) label = '✶  Pinch to close';
    else                     label = '✶  Pinch to add elements';

    push();
    textSize(14);
    let tw = textWidth(label) + 36;
    let bH = 40;
    let bX = width - tw - 12;
    let bY = 12;
    let r  = 7;

    // Outer warm-gold glow layer (largest, most transparent)
    noStroke();
    fill(210, 165, 55, 18);
    rect(bX - 3, bY - 3, tw + 6, bH + 6, r + 2);

    // Main body — parchment-warm glass
    fill(195, 155, 60, 45);
    rect(bX, bY, tw, bH, r);

    // Top edge highlight (simulates raised depth)
    fill(240, 210, 120, 55);
    rect(bX + 2, bY + 2, tw - 4, bH / 2 - 2, r - 1);

    // Border — warm gold, matching frame colour
    noFill();
    stroke(210, 168, 58, 200);
    strokeWeight(1.2);
    rect(bX, bY, tw, bH, r);

    // Inner inset line for extra depth
    stroke(240, 200, 100, 60);
    strokeWeight(0.6);
    rect(bX + 3, bY + 3, tw - 6, bH - 6, r - 2);

    // Text
    fill(235, 200, 100);
    noStroke();
    textAlign(LEFT, CENTER);
    textSize(14);
    text(label, bX + 16, bY + bH / 2);
    pop();
}

function drawElementPanel() {
    let panelX  = width - PANEL_W - 5;
    let panelY  = 70;
    let panelH  = height - 80;
    let thumbW  = PANEL_W - 28;
    let headerH = 54;
    let startY  = panelY + headerH;
    let scrollH = panelH - headerH - 30;

    push();
    rectMode(CORNER);

    // ── Panel shell ──────────────────────────────────────────────
    noFill();
    stroke(210, 168, 58, 35);
    strokeWeight(7);
    rect(panelX, panelY, PANEL_W, panelH, 12);

    fill(185, 148, 52, 32);
    stroke(210, 168, 58, 185);
    strokeWeight(1.3);
    rect(panelX, panelY, PANEL_W, panelH, 10);

    fill(240, 205, 110, 22);
    noStroke();
    rect(panelX + 3, panelY + 3, PANEL_W - 6, headerH - 6, 8);

    noFill();
    stroke(240, 200, 100, 30);
    strokeWeight(0.6);
    rect(panelX + 4, panelY + 4, PANEL_W - 8, panelH - 8, 8);

    // ── Header ───────────────────────────────────────────────────
    fill(230, 190, 90);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(15);
    text('✦  Elements  ✦', panelX + PANEL_W / 2, panelY + headerH / 2);

    stroke(210, 168, 58, 110);
    strokeWeight(0.8);
    line(panelX + 12, panelY + headerH, panelX + PANEL_W - 12, panelY + headerH);

    // ── Clip scrollable content ───────────────────────────────────
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(panelX + 6, panelY + headerH + 2, PANEL_W - 12, scrollH);
    drawingContext.clip();

    for (let i = 0; i < elementImages.length; i++) {
        let el  = elementImages[i];
        let tH  = thumbH(i);                              // dynamic height
        let ty  = startY + itemOffset(i) - panelScrollY + 8;
        let cx  = panelX + 14 + thumbW / 2;
        let cy  = ty + tH / 2;
        let cardH = tH + LABEL_H + 6;

        // Skip fully outside viewport
        if (ty + cardH < panelY + headerH) continue;
        if (ty > panelY + panelH)          continue;

        let hovering = (i === hoverElementIndex);

        // Card bg
        fill(hovering ? 210 : 200, hovering ? 168 : 160, hovering ? 58 : 55, hovering ? 55 : 20);
        noStroke();
        rect(panelX + 10, ty - 4, thumbW + 4, cardH, 6);

        // Card border
        noFill();
        stroke(210, 168, 58, hovering ? 200 : 80);
        strokeWeight(hovering ? 1.3 : 0.7);
        rect(panelX + 10, ty - 4, thumbW + 4, cardH, 6);

        // Image — transparent PNG, CORNER mode, exact aspect ratio
        imageMode(CORNER);
        image(el.img, panelX + 14, ty, thumbW, tH);

        // Dwell progress ring
        if (hovering) {
            let progress = constrain((millis() - hoverStartTime) / DWELL_TIME, 0, 1);
            let ringR    = min(thumbW, tH) / 2 + 6;
            noFill();
            stroke(210, 168, 58, 50);
            strokeWeight(4);
            ellipse(cx, cy, ringR * 2, ringR * 2);
            stroke(235, 195, 85, 235);
            strokeWeight(4);
            arc(cx, cy, ringR * 2, ringR * 2, -HALF_PI, -HALF_PI + TWO_PI * progress);
        }

        // Label
        fill(230, 200, 110);
        noStroke();
        textAlign(CENTER, TOP);
        textSize(12);
        text(el.label, panelX + PANEL_W / 2, ty + tH + 4);
    }

    drawingContext.restore();

    // ── Scrollbar ─────────────────────────────────────────────────
    let maxScroll = maxPanelScroll();
    if (maxScroll > 0) {
        let trackH   = scrollH - 8;
        let trackX   = panelX + PANEL_W - 8;
        let trackY   = panelY + headerH + 4;
        let thumbFrac = scrollH / (scrollH + maxScroll);
        let thumbLen  = max(24, trackH * thumbFrac);
        let thumbTop  = trackY + (panelScrollY / maxScroll) * (trackH - thumbLen);

        stroke(210, 168, 58, 35);
        strokeWeight(2);
        line(trackX, trackY, trackX, trackY + trackH);

        stroke(210, 168, 58, 170);
        strokeWeight(3);
        line(trackX, thumbTop, trackX, thumbTop + thumbLen);
    }

    // ── Hint ──────────────────────────────────────────────────────
    fill(200, 170, 90, 160);
    noStroke();
    textAlign(CENTER, BOTTOM);
    textSize(10);
    text('Hover to pick up  ·  Pinch to place', panelX + PANEL_W / 2, panelY + panelH - 8);

    pop();
}

function placeElement(x, y) {
    placedElements.push({
        img: activeElement.img,
        x: x,
        y: y,
        w: activeElement.w,
        h: activeElement.h
    });
    activeElement = null;
}
