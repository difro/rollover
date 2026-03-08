import * as THREE from "./vendor/three.module.js";

(function () {
  const app = document.getElementById("app");
  const overlay = document.getElementById("overlay");
  const overlayBody = document.getElementById("overlay-body");
  const sensorNote = document.getElementById("sensor-note");
  const scoreValue = document.getElementById("score-value");
  const shieldValue = document.getElementById("shield-value");
  const speedValue = document.getElementById("speed-value");
  const bestValue = document.getElementById("best-value");
  const modePill = document.getElementById("mode-pill");
  const statusLine = document.getElementById("status-line");
  const messageEl = document.getElementById("message");
  const speedOverlay = document.getElementById("speed-overlay");
  const damageFlash = document.getElementById("damage-flash");
  const gyroStartButton = document.getElementById("gyro-start");
  const touchStartButton = document.getElementById("touch-start");
  const recenterButton = document.getElementById("recenter-button");
  const defaultOverlayBody = overlayBody.textContent.trim();

  const safeStorage = {
    loadBest() {
      try {
        return Number(window.localStorage.getItem("rollover-best-score")) || 0;
      } catch (error) {
        return 0;
      }
    },
    saveBest(score) {
      try {
        window.localStorage.setItem("rollover-best-score", String(score));
      } catch (error) {
        return;
      }
    },
  };

  const state = {
    playing: false,
    controlMode: "touch",
    bestScore: safeStorage.loadBest(),
    score: 0,
    shield: 100,
    speed: 32,
    distance: 0,
    time: 0,
    targetX: 0,
    playerX: 0,
    pointerTilt: 0,
    sensorTilt: 0,
    keyboardTilt: 0,
    neutralRoll: 0,
    lastRoll: 0,
    hasSensorReading: false,
    spawnTimer: 0.55,
    hitCooldown: 0,
    invulnBlink: 0,
    damagePulse: 0,
    cameraShake: 0,
    messageTimer: 0,
    playerFloat: 0,
    lastFrameTime: 0,
    pointerDown: false,
    enemies: [],
    laneSegments: [],
    gates: [],
    stars: null,
    starsData: [],
  };

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x02070d, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x02070d, 18, 130);

  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    220,
  );
  camera.position.set(0, 2.7, 7.5);
  camera.lookAt(0, -0.8, -18);

  const world = new THREE.Group();
  const enemyLayer = new THREE.Group();
  scene.add(world);
  scene.add(enemyLayer);

  const hemiLight = new THREE.HemisphereLight(0x8fdfff, 0x03131f, 1.1);
  const sunLight = new THREE.DirectionalLight(0xffe0aa, 1.2);
  sunLight.position.set(3.5, 8, 6);
  const fillLight = new THREE.PointLight(0x38d8ff, 16, 42, 2.2);
  fillLight.position.set(0, 1.6, 8);
  scene.add(hemiLight, sunLight, fillLight);

  const player = createPlayer();
  player.position.set(0, -1.12, 2.6);
  scene.add(player);

  createRunway();
  createStars();
  updateHud();
  updateMenuCopy();
  updateModeBadge();
  if (!supportsDeviceOrientation()) {
    gyroStartButton.textContent = "센서 없음";
  } else if (!isSecureSensorContext()) {
    gyroStartButton.textContent = "HTTPS 필요";
  }

  window.addEventListener("resize", handleResize);
  window.addEventListener("deviceorientation", handleOrientation, true);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("pointerdown", handlePointerDown, { passive: true });
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("pointerup", handlePointerUp, { passive: true });
  window.addEventListener("pointercancel", handlePointerUp, { passive: true });

  gyroStartButton.addEventListener("click", startWithGyro);
  touchStartButton.addEventListener("click", function () {
    startRun("touch");
  });
  recenterButton.addEventListener("click", recenterControl);

  requestAnimationFrame(loop);

  function createPlayer() {
    const group = new THREE.Group();

    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0xd7ecff,
      emissive: 0x0c3552,
      metalness: 0.45,
      roughness: 0.28,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x62d8ff,
      emissive: 0x1499d4,
      metalness: 0.15,
      roughness: 0.22,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x061521,
      emissive: 0x081018,
      metalness: 0.32,
      roughness: 0.65,
    });

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 6), accentMaterial);
    nose.rotation.x = -Math.PI / 2;
    group.add(nose);

    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.35, 8), hullMaterial);
    fuselage.rotation.x = -Math.PI / 2;
    fuselage.position.z = 0.05;
    group.add(fuselage);

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 18), darkMaterial);
    cockpit.scale.set(1, 0.66, 0.82);
    cockpit.position.set(0, 0.18, -0.08);
    group.add(cockpit);

    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.42), hullMaterial);
    leftWing.position.set(-0.72, -0.03, 0.12);
    leftWing.rotation.z = 0.18;
    group.add(leftWing);

    const rightWing = leftWing.clone();
    rightWing.position.x = 0.72;
    rightWing.rotation.z = -0.18;
    group.add(rightWing);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.08), accentMaterial);
    tail.position.set(0, 0.23, 0.72);
    group.add(tail);

    const engineGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x8ee7ff }),
    );
    engineGlow.position.set(0, 0, 0.95);
    group.add(engineGlow);

    const engineLight = new THREE.PointLight(0x52d8ff, 9, 14, 2);
    engineLight.position.set(0, 0, 1.2);
    group.add(engineLight);

    return group;
  }

  function createRunway() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 240),
      new THREE.MeshStandardMaterial({
        color: 0x04111a,
        metalness: 0.1,
        roughness: 0.86,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2.35, -86);
    world.add(floor);

    const grid = new THREE.GridHelper(14, 18, 0x3ecfff, 0x0c3145);
    grid.position.set(0, -2.31, -36);
    grid.material.opacity = 0.26;
    grid.material.transparent = true;
    world.add(grid);

    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x6bdcff,
      transparent: true,
      opacity: 0.85,
    });
    const markerGeometry = new THREE.BoxGeometry(0.16, 0.02, 4.2);
    const lanes = [-2.6, 0, 2.6];
    for (let segment = 0; segment < 24; segment += 1) {
      for (let lane = 0; lane < lanes.length; lane += 1) {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(lanes[lane], -2.24, -segment * 8 - 8);
        marker.userData.baseZ = marker.position.z;
        state.laneSegments.push(marker);
        world.add(marker);
      }
    }

    const railGeometry = new THREE.BoxGeometry(0.08, 0.18, 220);
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x1db8ff,
      emissive: 0x0a4361,
      metalness: 0.22,
      roughness: 0.48,
    });
    const leftRail = new THREE.Mesh(railGeometry, railMaterial);
    leftRail.position.set(-4.8, -1.86, -96);
    const rightRail = leftRail.clone();
    rightRail.position.x = 4.8;
    world.add(leftRail, rightRail);

    const gateMaterial = new THREE.LineBasicMaterial({
      color: 0x52cfff,
      transparent: true,
      opacity: 0.33,
    });
    const gateGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(10, 4.4, 0.16));
    for (let index = 0; index < 12; index += 1) {
      const gate = new THREE.LineSegments(gateGeometry, gateMaterial);
      gate.position.set(0, -0.2, -index * 16 - 18);
      gate.userData.baseZ = gate.position.z;
      state.gates.push(gate);
      world.add(gate);
    }
  }

  function createStars() {
    const starCount = 220;
    const positions = new Float32Array(starCount * 3);
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      color: 0xa3ecff,
      size: 0.18,
      transparent: true,
      opacity: 0.92,
      sizeAttenuation: true,
    });

    state.starsData.length = 0;
    for (let index = 0; index < starCount; index += 1) {
      const x = randomRange(-15, 15);
      const y = randomRange(-3, 10);
      const z = randomRange(-170, 8);
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      state.starsData.push({
        x: x,
        y: y,
        z: z,
        speed: randomRange(1.1, 2.5),
      });
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    state.stars = new THREE.Points(geometry, material);
    scene.add(state.stars);
  }

  function spawnEnemy() {
    const enemy = new THREE.Group();
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0xffcb73,
      emissive: 0xc14f08,
      metalness: 0.25,
      roughness: 0.34,
    });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8a54,
      transparent: true,
      opacity: 0.9,
    });
    const finMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c1304,
      emissive: 0x330700,
      metalness: 0.2,
      roughness: 0.75,
    });

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.56, 0), coreMaterial);
    enemy.add(core);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.08, 8, 20), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    enemy.add(ring);

    const leftFin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.16), finMaterial);
    leftFin.position.x = -0.52;
    leftFin.rotation.z = 0.34;
    enemy.add(leftFin);

    const rightFin = leftFin.clone();
    rightFin.position.x = 0.52;
    rightFin.rotation.z = -0.34;
    enemy.add(rightFin);

    const trailLight = new THREE.PointLight(0xff8c47, 6.5, 10, 2.2);
    trailLight.position.z = 0.2;
    enemy.add(trailLight);

    enemy.position.set(randomRange(-3.8, 3.8), randomRange(2.2, 6.3), randomRange(-118, -78));
    enemy.userData = {
      drift: randomRange(-0.65, 0.65),
      speedScale: randomRange(0.94, 1.24),
      descentRate: randomRange(1.2, 1.85),
      phase: randomRange(0, Math.PI * 2),
      spin: randomRange(-2.6, 2.6),
      grazed: false,
    };

    enemyLayer.add(enemy);
    state.enemies.push(enemy);
  }

  function updateHud() {
    scoreValue.textContent = String(Math.floor(state.score)).padStart(4, "0");
    shieldValue.textContent = Math.max(0, Math.round(state.shield)) + "%";
    speedValue.textContent = Math.round(state.speed * 10) + " KT";
    bestValue.textContent = String(Math.floor(state.bestScore)).padStart(4, "0");
  }

  function updateModeBadge() {
    modePill.textContent = state.controlMode === "gyro" ? "Gyro" : "Touch";
  }

  function updateMenuCopy(extra) {
    if (extra) {
      sensorNote.textContent = extra;
      return;
    }

    if (!supportsDeviceOrientation()) {
      sensorNote.textContent = "현재 환경에서는 자이로센서를 쓸 수 없어 터치 조작으로 바로 플레이합니다.";
      return;
    }

    if (!isSecureSensorContext()) {
      sensorNote.textContent =
        "휴대폰 센서는 HTTPS 또는 localhost 에서만 동작합니다. 지금 주소에서는 터치 조작만 가능합니다.";
      return;
    }

    if (supportsDeviceOrientation()) {
      sensorNote.textContent = "아이폰은 시작 버튼을 눌렀을 때 센서 권한을 요청합니다.";
      return;
    }
  }

  function showMessage(text, duration) {
    messageEl.textContent = text;
    messageEl.classList.add("visible");
    state.messageTimer = duration || 1.1;
  }

  function hideMessage() {
    messageEl.classList.remove("visible");
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  function handleOrientation(event) {
    const roll = extractRoll(event);
    if (!Number.isFinite(roll)) {
      return;
    }

    state.hasSensorReading = true;
    state.lastRoll = roll;
    if (state.controlMode === "gyro") {
      state.sensorTilt = clamp((roll - state.neutralRoll) / 24, -1, 1);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
      state.keyboardTilt = -1;
    }
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
      state.keyboardTilt = 1;
    }
  }

  function handleKeyUp(event) {
    if (
      event.key === "ArrowLeft" ||
      event.key === "a" ||
      event.key === "A" ||
      event.key === "ArrowRight" ||
      event.key === "d" ||
      event.key === "D"
    ) {
      state.keyboardTilt = 0;
    }
  }

  function handlePointerDown(event) {
    if (!state.playing || state.controlMode === "gyro") {
      return;
    }

    state.pointerDown = true;
    state.pointerTilt = clientXToTilt(event.clientX);
  }

  function handlePointerMove(event) {
    if (!state.playing || state.controlMode === "gyro" || !state.pointerDown) {
      return;
    }

    state.pointerTilt = clientXToTilt(event.clientX);
  }

  function handlePointerUp() {
    state.pointerDown = false;
  }

  async function startWithGyro() {
    if (!supportsDeviceOrientation()) {
      updateMenuCopy("이 브라우저는 센서를 노출하지 않아 터치 조작으로 시작합니다.");
      startRun("touch");
      return;
    }

    if (!isSecureSensorContext()) {
      updateMenuCopy(
        "현재 주소는 보안 컨텍스트가 아니라 센서를 쓸 수 없습니다. HTTPS 또는 localhost 로 열어야 합니다.",
      );
      startRun("touch");
      return;
    }

    try {
      const permissionState = await requestSensorPermission();
      if (permissionState !== "granted") {
        updateMenuCopy("센서 권한이 거부되어 터치 조작으로 전환합니다.");
        startRun("touch");
        return;
      }
    } catch (error) {
      updateMenuCopy("센서 권한 요청에 실패해 터치 조작으로 전환합니다.");
      startRun("touch");
      return;
    }

    startRun("gyro");
  }

  function recenterControl() {
    if (state.controlMode === "gyro") {
      state.neutralRoll = state.lastRoll;
      showMessage("Recentered", 0.8);
      statusLine.textContent = "중립 자세를 다시 잡았습니다. 계속 좌우로 롤 하세요.";
      return;
    }

    state.pointerTilt = 0;
    showMessage("Centered", 0.8);
    statusLine.textContent = "터치 입력을 중앙으로 되돌렸습니다.";
  }

  function startRun(mode) {
    clearEnemies();
    resetRunState();

    state.controlMode = mode;
    overlayBody.textContent = defaultOverlayBody;
    updateModeBadge();
    if (mode === "gyro") {
      state.neutralRoll = state.lastRoll;
      statusLine.textContent = "휴대폰을 편하게 든 뒤 좌우로 롤 해서 비행 라인을 조정하세요.";
      showMessage("Gyro Armed", 1);
      window.setTimeout(function () {
        if (state.playing && state.controlMode === "gyro" && !state.hasSensorReading) {
          state.controlMode = "touch";
          updateModeBadge();
          statusLine.textContent =
            "센서 응답이 없어 터치 조작으로 전환했습니다. 화면을 좌우로 드래그 하세요.";
          showMessage("Touch Fallback", 1.2);
        }
      }, 1200);
    } else {
      statusLine.textContent = "화면을 좌우로 드래그 해서 비행 라인을 조정하세요.";
      showMessage("Touch Flight", 1);
    }

    overlay.classList.remove("visible");
    state.playing = true;
    updateHud();
  }

  function resetRunState() {
    state.playing = false;
    state.score = 0;
    state.shield = 100;
    state.speed = 32;
    state.distance = 0;
    state.time = 0;
    state.targetX = 0;
    state.playerX = 0;
    state.pointerTilt = 0;
    state.sensorTilt = 0;
    state.spawnTimer = 0.55;
    state.hitCooldown = 0;
    state.invulnBlink = 0;
    state.damagePulse = 0;
    state.cameraShake = 0;
    state.playerFloat = 0;
    state.pointerDown = false;
    player.position.x = 0;
    player.rotation.set(0, 0, 0);
    speedOverlay.style.opacity = "0";
    damageFlash.style.opacity = "0";
  }

  function endRun() {
    state.playing = false;
    state.bestScore = Math.max(state.bestScore, Math.floor(state.score));
    safeStorage.saveBest(state.bestScore);
    updateHud();

    overlayBody.textContent =
      "격추되었습니다. 점수 " +
      Math.floor(state.score) +
      "점, 최고 기록 " +
      state.bestScore +
      "점입니다. 다시 롤 해서 더 오래 살아남아 보세요.";
    overlay.classList.add("visible");
    updateMenuCopy();
  }

  function clearEnemies() {
    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
      enemyLayer.remove(state.enemies[index]);
    }
    state.enemies.length = 0;
  }

  function loop(timestamp) {
    if (!state.lastFrameTime) {
      state.lastFrameTime = timestamp;
    }
    const delta = Math.min((timestamp - state.lastFrameTime) / 1000, 0.05);
    state.lastFrameTime = timestamp;

    if (state.playing) {
      updateGame(delta);
    } else {
      updateIdle(delta);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  function updateIdle(delta) {
    animateWorld(delta, 18);
    player.rotation.z = THREE.MathUtils.damp(player.rotation.z, 0, 4, delta);
    player.rotation.x = THREE.MathUtils.damp(player.rotation.x, 0.08, 4, delta);
    player.position.y = THREE.MathUtils.damp(player.position.y, -1.08, 4, delta);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, 4, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 2.7, 4, delta);
    camera.fov = THREE.MathUtils.damp(camera.fov, 62, 4, delta);
    camera.updateProjectionMatrix();
    camera.lookAt(0, -0.8, -18);
  }

  function updateGame(delta) {
    state.time += delta;
    state.distance += state.speed * delta;
    state.speed = Math.min(62, 32 + state.time * 1.55);

    if (state.controlMode !== "gyro") {
      const targetTouch = state.pointerDown ? state.pointerTilt : 0;
      state.pointerTilt = THREE.MathUtils.damp(state.pointerTilt, targetTouch, 5, delta);
    }

    const currentTilt = clamp(
      (state.controlMode === "gyro" ? state.sensorTilt : state.pointerTilt) +
        state.keyboardTilt * 0.75,
      -1,
      1,
    );

    state.targetX = currentTilt * 3.85;
    state.playerX = THREE.MathUtils.damp(state.playerX, state.targetX, 6.8, delta);
    state.playerFloat += delta;
    player.position.x = state.playerX;
    player.position.y = -1.12 + Math.sin(state.playerFloat * 14) * 0.04;
    player.rotation.z = THREE.MathUtils.damp(player.rotation.z, -currentTilt * 0.95, 8.5, delta);
    player.rotation.x = THREE.MathUtils.damp(
      player.rotation.x,
      0.1 + Math.abs(currentTilt) * 0.05,
      7,
      delta,
    );

    state.spawnTimer -= delta;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      const nextWave = Math.max(0.24, 0.72 - state.time * 0.015);
      state.spawnTimer = nextWave + randomRange(0.02, 0.14);
      if (state.speed > 48 && Math.random() < 0.18) {
        state.spawnTimer *= 0.65;
      }
    }

    animateWorld(delta, state.speed);
    updateEnemies(delta);
    updateCamera(delta, currentTilt);
    updateEffects(delta);
    updateHud();
  }

  function updateEnemies(delta) {
    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.enemies[index];
      const data = enemy.userData;
      enemy.position.z += state.speed * data.speedScale * delta;
      enemy.position.y = Math.max(
        -1.1,
        enemy.position.y - data.descentRate * delta * 2.2,
      );
      enemy.position.x += Math.sin(state.time * 2.2 + data.phase) * data.drift * delta;
      enemy.rotation.x += delta * (0.8 + data.spin * 0.25);
      enemy.rotation.y += delta * 2.6;
      enemy.rotation.z += delta * data.spin;

      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      const dz = enemy.position.z - player.position.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;

      if (!data.grazed && dz > -1.3 && dz < 0.8 && Math.abs(dx) < 1.1) {
        data.grazed = true;
        state.score += 30;
        showMessage("Near Miss +30", 0.65);
      }

      if (state.hitCooldown <= 0 && distanceSq < 1.5) {
        registerHit();
        enemyLayer.remove(enemy);
        state.enemies.splice(index, 1);
        continue;
      }

      if (enemy.position.z > 12) {
        enemyLayer.remove(enemy);
        state.enemies.splice(index, 1);
      }
    }
  }

  function registerHit() {
    state.shield = Math.max(0, state.shield - 34);
    state.hitCooldown = 1.15;
    state.invulnBlink = 1.15;
    state.damagePulse = 1;
    state.cameraShake = 1;
    showMessage("Impact", 0.9);

    if (state.shield <= 0) {
      endRun();
    }
  }

  function animateWorld(delta, worldSpeed) {
    const wrapDepth = 192;
    for (let index = 0; index < state.laneSegments.length; index += 1) {
      const marker = state.laneSegments[index];
      marker.position.z += worldSpeed * delta;
      if (marker.position.z > 14) {
        marker.position.z -= wrapDepth;
      }
    }

    for (let index = 0; index < state.gates.length; index += 1) {
      const gate = state.gates[index];
      gate.position.z += worldSpeed * delta;
      gate.rotation.z = Math.sin(state.time * 0.4 + index) * 0.025;
      if (gate.position.z > 12) {
        gate.position.z -= 192;
      }
    }

    const positions = state.stars.geometry.attributes.position.array;
    for (let index = 0; index < state.starsData.length; index += 1) {
      const star = state.starsData[index];
      star.z += worldSpeed * delta * star.speed;
      if (star.z > 10) {
        star.x = randomRange(-16, 16);
        star.y = randomRange(-3, 10);
        star.z = randomRange(-180, -42);
      }
      positions[index * 3] = star.x;
      positions[index * 3 + 1] = star.y;
      positions[index * 3 + 2] = star.z;
    }
    state.stars.geometry.attributes.position.needsUpdate = true;
  }

  function updateCamera(delta, currentTilt) {
    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      state.playerX * 0.34 + Math.sin(state.time * 8) * state.cameraShake * 0.12,
      6,
      delta,
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      2.7 + Math.cos(state.time * 10) * state.cameraShake * 0.08,
      6,
      delta,
    );
    camera.fov = THREE.MathUtils.damp(
      camera.fov,
      62 + (state.speed - 32) * 0.26 + Math.abs(currentTilt) * 1.2,
      5,
      delta,
    );
    camera.updateProjectionMatrix();
    camera.lookAt(state.playerX * 0.14, -0.82 + currentTilt * 0.04, -18);
  }

  function updateEffects(delta) {
    if (state.hitCooldown > 0) {
      state.hitCooldown = Math.max(0, state.hitCooldown - delta);
    }

    if (state.invulnBlink > 0) {
      state.invulnBlink = Math.max(0, state.invulnBlink - delta);
      const blink = Math.sin(state.time * 42) > 0 ? 0.42 : 1;
      player.visible = blink > 0.5;
    } else {
      player.visible = true;
    }

    state.damagePulse = THREE.MathUtils.damp(state.damagePulse, 0, 5, delta);
    state.cameraShake = THREE.MathUtils.damp(state.cameraShake, 0, 7, delta);

    const speedPulse = clamp((state.speed - 34) / 26, 0, 1);
    speedOverlay.style.opacity = String(speedPulse * 0.9);
    damageFlash.style.opacity = String(state.damagePulse * 0.8);

    if (state.messageTimer > 0) {
      state.messageTimer = Math.max(0, state.messageTimer - delta);
      if (state.messageTimer === 0) {
        hideMessage();
      }
    }
  }

  function extractRoll(event) {
    const screenAngle =
      Number(
        window.screen &&
          window.screen.orientation &&
          typeof window.screen.orientation.angle === "number"
          ? window.screen.orientation.angle
          : 0,
      ) || 0;

    if (screenAngle === 90) {
      return Number.isFinite(event.beta) ? -event.beta : event.gamma;
    }

    if (screenAngle === -90 || screenAngle === 270) {
      return Number.isFinite(event.beta) ? event.beta : event.gamma;
    }

    return event.gamma;
  }

  function clientXToTilt(clientX) {
    return clamp((clientX / window.innerWidth) * 2 - 1, -1, 1);
  }

  function requestSensorPermission() {
    if (
      typeof window.DeviceOrientationEvent !== "undefined" &&
      typeof window.DeviceOrientationEvent.requestPermission === "function"
    ) {
      return window.DeviceOrientationEvent.requestPermission();
    }

    return Promise.resolve("granted");
  }

  function supportsDeviceOrientation() {
    return typeof window.DeviceOrientationEvent !== "undefined";
  }

  function isSecureSensorContext() {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    return window.isSecureContext || isLocalhost;
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
