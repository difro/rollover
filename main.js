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
  const pickupFlash = document.getElementById("pickup-flash");
  const gyroStartButton = document.getElementById("gyro-start");
  const touchStartButton = document.getElementById("touch-start");
  const recenterButton = document.getElementById("recenter-button");
  const defaultOverlayBody = overlayBody.textContent.trim();
  let fatalErrorShown = false;

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
    controlMode: "idle",
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
    pickupPulse: 0,
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

  let renderer;
  let scene;
  let camera;
  let world;
  let enemyLayer;
  let player;

  window.addEventListener("error", function (event) {
    showFatalError(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", function (event) {
    showFatalError(event.reason);
  });

  bindPress(gyroStartButton, startWithGyro);
  bindPress(touchStartButton, function () {
    startRun("touch");
  });
  bindPress(recenterButton, recenterControl);

  boot();

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

  function pickEnemyType() {
    const rammerBias = clamp((state.time - 18) / 34, 0, 0.18);
    const sweeperBias = clamp((state.time - 8) / 28, 0, 0.16);
    const droneCutoff = 0.54 - sweeperBias - rammerBias;
    const sweeperCutoff = 0.82 - rammerBias;
    const roll = Math.random();

    if (roll < droneCutoff) {
      return "drone";
    }

    if (roll < sweeperCutoff) {
      return "sweeper";
    }

    return "rammer";
  }

  function pickPickupType() {
    const roll = Math.random();
    if (roll < 0.4) {
      return "shield";
    }

    if (roll < 0.75) {
      return "score";
    }

    return "boost";
  }

  function spawnEnemy() {
    const type = pickEnemyType();
    const enemy = new THREE.Group();
    const startX = type === "sweeper" ? randomRange(-2.3, 2.3) : randomRange(-3.8, 3.8);
    const startY = randomRange(2.2, 6.3);
    const startZ = randomRange(-118, -78);

    if (type === "rammer") {
      const spearMaterial = new THREE.MeshStandardMaterial({
        color: 0xff8b67,
        emissive: 0xc33f12,
        metalness: 0.26,
        roughness: 0.28,
      });
      const finMaterial = new THREE.MeshStandardMaterial({
        color: 0x5b1207,
        emissive: 0x2d0700,
        metalness: 0.22,
        roughness: 0.58,
      });
      const spear = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.8, 6), spearMaterial);
      spear.rotation.x = -Math.PI / 2;
      enemy.add(spear);

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.3, 10), spearMaterial);
      body.rotation.x = -Math.PI / 2;
      body.position.z = 0.38;
      enemy.add(body);

      const leftFin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.18), finMaterial);
      leftFin.position.set(-0.48, -0.02, 0.46);
      leftFin.rotation.z = 0.38;
      enemy.add(leftFin);

      const rightFin = leftFin.clone();
      rightFin.position.x = 0.48;
      rightFin.rotation.z = -0.38;
      enemy.add(rightFin);

      const light = new THREE.PointLight(0xff7240, 8.5, 12, 2);
      light.position.z = 0.2;
      enemy.add(light);

      enemy.userData = {
        kind: "enemy",
        type: "rammer",
        baseX: startX,
        targetY: -1.18,
        speedScale: randomRange(1.22, 1.52),
        descentRate: randomRange(1.8, 2.5),
        phase: randomRange(0, Math.PI * 2),
        spin: randomRange(3.2, 4.4),
        hitRadius: 1.35,
        nearMissX: 0.95,
        damage: 42,
        hitMessage: "Rammed",
        grazed: false,
      };
    } else if (type === "sweeper") {
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xffd070,
        emissive: 0xac5f10,
        metalness: 0.22,
        roughness: 0.42,
      });
      const wingMaterial = new THREE.MeshStandardMaterial({
        color: 0x7a2b10,
        emissive: 0x431000,
        metalness: 0.18,
        roughness: 0.52,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.34, 0.68), bodyMaterial);
      enemy.add(body);

      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.12, 0.22), wingMaterial);
      wing.position.y = -0.02;
      enemy.add(wing);

      const blade = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), bodyMaterial);
      blade.rotation.x = Math.PI / 2;
      enemy.add(blade);

      const light = new THREE.PointLight(0xffb24e, 7, 11, 2);
      light.position.z = 0.1;
      enemy.add(light);

      enemy.userData = {
        kind: "enemy",
        type: "sweeper",
        baseX: startX,
        targetY: -0.96,
        speedScale: randomRange(0.92, 1.08),
        descentRate: randomRange(1.0, 1.35),
        phase: randomRange(0, Math.PI * 2),
        sweepAmp: randomRange(1.45, 2.2),
        sweepFreq: randomRange(1.8, 2.4),
        spin: randomRange(-1.4, 1.4),
        hitRadius: 1.65,
        nearMissX: 1.45,
        damage: 26,
        hitMessage: "Swept",
        grazed: false,
      };
    } else {
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

      const light = new THREE.PointLight(0xff8c47, 6.5, 10, 2.2);
      light.position.z = 0.2;
      enemy.add(light);

      enemy.userData = {
        kind: "enemy",
        type: "drone",
        baseX: startX,
        targetY: -1.1,
        speedScale: randomRange(0.94, 1.24),
        descentRate: randomRange(1.2, 1.85),
        phase: randomRange(0, Math.PI * 2),
        driftAmp: randomRange(0.75, 1.25),
        spin: randomRange(-2.6, 2.6),
        hitRadius: 1.25,
        nearMissX: 1.1,
        damage: 34,
        hitMessage: "Impact",
        grazed: false,
      };
    }

    enemy.position.set(startX, startY, startZ);
    enemyLayer.add(enemy);
    state.enemies.push(enemy);
  }

  function spawnPickup() {
    const type = pickPickupType();
    const pickup = new THREE.Group();
    const startX = type === "boost" ? randomRange(-2.8, 2.8) : randomRange(-3.2, 3.2);
    const startY = randomRange(1.6, 5.2);
    const startZ = randomRange(-112, -84);

    if (type === "score") {
      const crystalMaterial = new THREE.MeshStandardMaterial({
        color: 0x7fe8ff,
        emissive: 0x1692d5,
        metalness: 0.18,
        roughness: 0.14,
      });
      const shardMaterial = new THREE.MeshBasicMaterial({
        color: 0xc1f7ff,
        transparent: true,
        opacity: 0.9,
      });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), crystalMaterial);
      pickup.add(crystal);

      const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.05, 10, 26), shardMaterial);
      orbit.rotation.y = Math.PI / 2;
      pickup.add(orbit);

      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 0.14), crystalMaterial);
      pickup.add(shard);

      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.14), crystalMaterial);
      pickup.add(cross);

      const light = new THREE.PointLight(0x7fe8ff, 8, 14, 2);
      light.position.z = 0.12;
      pickup.add(light);

      pickup.userData = {
        kind: "pickup",
        type: "score",
        baseX: startX,
        targetY: -0.82,
        speedScale: randomRange(0.92, 1.08),
        descentRate: randomRange(0.95, 1.22),
        phase: randomRange(0, Math.PI * 2),
        pulse: randomRange(7, 10),
        driftAmp: randomRange(0.32, 0.56),
        spin: randomRange(1.4, 2.6),
        hitRadius: 1.28,
        scoreReward: 260,
        shieldReward: 0,
        speedReward: 0.4,
        collectMessage: "Cache +260",
      };
    } else if (type === "boost") {
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x77ffd3,
        transparent: true,
        opacity: 0.94,
      });
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0xd9fff6,
        emissive: 0x1fc1ff,
        metalness: 0.16,
        roughness: 0.18,
      });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 18), coreMaterial);
      pickup.add(core);

      const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.05, 10, 28), ringMaterial);
      ringA.rotation.x = Math.PI / 2;
      pickup.add(ringA);

      const ringB = ringA.clone();
      ringB.scale.setScalar(1.34);
      ringB.rotation.y = Math.PI / 2;
      pickup.add(ringB);

      const ringC = ringA.clone();
      ringC.scale.setScalar(1.68);
      pickup.add(ringC);

      const light = new THREE.PointLight(0x77ffd3, 9.5, 15, 2);
      light.position.z = 0.15;
      pickup.add(light);

      pickup.userData = {
        kind: "pickup",
        type: "boost",
        baseX: startX,
        targetY: -0.74,
        speedScale: randomRange(0.94, 1.12),
        descentRate: randomRange(1.0, 1.28),
        phase: randomRange(0, Math.PI * 2),
        pulse: randomRange(8, 11),
        driftAmp: randomRange(0.56, 0.92),
        spin: randomRange(2.4, 3.4),
        hitRadius: 1.34,
        scoreReward: 120,
        shieldReward: 10,
        speedReward: 4,
        collectMessage: "Boost +120",
      };
    } else {
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0xb8fff1,
        emissive: 0x14c89a,
        metalness: 0.18,
        roughness: 0.18,
      });
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x66ffe0,
        transparent: true,
        opacity: 0.92,
      });
      const finMaterial = new THREE.MeshStandardMaterial({
        color: 0x114e48,
        emissive: 0x0a3d37,
        metalness: 0.22,
        roughness: 0.42,
      });

      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), coreMaterial);
      pickup.add(core);

      const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.055, 10, 30), ringMaterial);
      ringA.rotation.x = Math.PI / 2;
      pickup.add(ringA);

      const ringB = ringA.clone();
      ringB.rotation.y = Math.PI / 2;
      pickup.add(ringB);

      const verticalFin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.08, 0.12), finMaterial);
      pickup.add(verticalFin);

      const horizontalFin = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.16, 0.12), finMaterial);
      pickup.add(horizontalFin);

      const light = new THREE.PointLight(0x66ffe0, 8.5, 14, 2);
      light.position.z = 0.18;
      pickup.add(light);

      pickup.userData = {
        kind: "pickup",
        type: "shield",
        baseX: startX,
        targetY: -0.78,
        speedScale: randomRange(0.9, 1.08),
        descentRate: randomRange(0.85, 1.15),
        phase: randomRange(0, Math.PI * 2),
        pulse: randomRange(6, 9),
        driftAmp: randomRange(0.42, 0.66),
        spin: randomRange(1.2, 2.4),
        hitRadius: 1.3,
        scoreReward: 80,
        shieldReward: 28,
        speedReward: 0.8,
        collectMessage: "Shield +28",
      };
    }

    pickup.position.set(startX, startY, startZ);
    enemyLayer.add(pickup);
    state.enemies.push(pickup);
  }

  function updateHud() {
    scoreValue.textContent = String(Math.floor(state.score)).padStart(4, "0");
    shieldValue.textContent = Math.max(0, Math.round(state.shield)) + "%";
    speedValue.textContent = Math.round(state.speed * 10) + " KT";
    bestValue.textContent = String(Math.floor(state.bestScore)).padStart(4, "0");
  }

  function updateModeBadge() {
    if (state.controlMode === "gyro") {
      modePill.textContent = "Gyro";
      return;
    }

    if (state.controlMode === "touch") {
      modePill.textContent = "Touch";
      return;
    }

    modePill.textContent = "Standby";
  }

  function updateMenuCopy(extra) {
    if (extra) {
      sensorNote.textContent = extra;
      return;
    }

    if (!supportsDeviceOrientation()) {
      sensorNote.textContent =
        "현재 환경에서는 자이로센서를 쓸 수 없습니다. 필요하면 아래 터치 시작을 직접 눌러 플레이하세요.";
      return;
    }

    if (!isSecureSensorContext()) {
      sensorNote.textContent =
        "휴대폰 센서는 HTTPS 또는 localhost 에서만 동작합니다. 센서를 쓰려면 보안 주소로 다시 열어야 합니다.";
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

  function bindPress(element, handler) {
    let lastFire = 0;

    function fire(event) {
      const now = Date.now();
      if (now - lastFire < 350) {
        return;
      }
      lastFire = now;
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      handler(event);
    }

    element.addEventListener("click", fire);
    element.addEventListener("pointerup", fire);
    element.addEventListener("touchend", fire, { passive: false });
  }

  function boot() {
    try {
      renderer = new THREE.WebGLRenderer({
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

      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x02070d, 18, 130);

      camera = new THREE.PerspectiveCamera(
        62,
        window.innerWidth / window.innerHeight,
        0.1,
        220,
      );
      camera.position.set(0, 2.7, 7.5);
      camera.lookAt(0, -0.8, -18);

      world = new THREE.Group();
      enemyLayer = new THREE.Group();
      scene.add(world);
      scene.add(enemyLayer);

      const hemiLight = new THREE.HemisphereLight(0x8fdfff, 0x03131f, 1.1);
      const sunLight = new THREE.DirectionalLight(0xffe0aa, 1.2);
      sunLight.position.set(3.5, 8, 6);
      const fillLight = new THREE.PointLight(0x38d8ff, 16, 42, 2.2);
      fillLight.position.set(0, 1.6, 8);
      scene.add(hemiLight, sunLight, fillLight);

      player = createPlayer();
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

      requestAnimationFrame(loop);
    } catch (error) {
      showFatalError(error);
    }
  }

  function showFatalError(error) {
    if (fatalErrorShown) {
      return;
    }
    fatalErrorShown = true;

    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error || "unknown error");

    overlay.classList.add("visible");
    overlayBody.textContent = "초기화에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
    sensorNote.textContent = "오류: " + message.slice(0, 160);
    statusLine.textContent = "초기화 오류가 발생했습니다.";
    gyroStartButton.disabled = true;
    touchStartButton.disabled = true;
    document.body.classList.remove("playing");
  }

  function handleResize() {
    if (!camera || !renderer) {
      return;
    }
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

    const firstSensorRead = !state.hasSensorReading;
    state.hasSensorReading = true;
    state.lastRoll = roll;
    if (state.controlMode === "gyro") {
      state.sensorTilt = clamp((roll - state.neutralRoll) / 24, -1, 1);
      if (firstSensorRead) {
        statusLine.textContent =
          "센서 입력이 연결되었습니다. 주황 드론은 피하고 청록 코어는 받아내세요.";
        showMessage("Gyro Live", 0.9);
      }
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
      updateMenuCopy("이 브라우저는 센서를 노출하지 않습니다. 센서 시작은 사용할 수 없습니다.");
      showMessage("No Gyro", 1.2);
      return;
    }

    if (!isSecureSensorContext()) {
      updateMenuCopy(
        "현재 주소는 보안 컨텍스트가 아니라 센서를 쓸 수 없습니다. HTTPS 또는 localhost 로 열어야 합니다.",
      );
      showMessage("HTTPS Needed", 1.2);
      return;
    }

    try {
      const permissionState = await requestSensorPermission();
      if (permissionState !== "granted") {
        updateMenuCopy("센서 권한이 거부되었습니다. 브라우저 설정에서 모션 권한을 허용한 뒤 다시 시도하세요.");
        showMessage("Gyro Blocked", 1.2);
        return;
      }
    } catch (error) {
      updateMenuCopy("센서 권한 요청에 실패했습니다. 페이지를 다시 열거나 브라우저 권한 설정을 확인하세요.");
      showMessage("Gyro Error", 1.2);
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
    state.hasSensorReading = false;
    overlayBody.textContent = defaultOverlayBody;
    updateModeBadge();
    if (mode === "gyro") {
      state.neutralRoll = state.lastRoll;
      statusLine.textContent =
        "휴대폰을 편하게 든 뒤 잠깐 기울여 센서를 깨우세요. 주황 적은 피하고 청록 코어는 먹으면 됩니다.";
      showMessage("Gyro Armed", 1);
      window.setTimeout(function () {
        if (state.playing && state.controlMode === "gyro" && !state.hasSensorReading) {
          statusLine.textContent =
            "아직 센서 입력이 없습니다. 휴대폰을 한 번 더 기울이거나 모션 권한을 확인하세요.";
          showMessage("Waiting Gyro", 1.2);
        }
      }, 1200);
    } else {
      statusLine.textContent =
        "화면을 좌우로 드래그 하세요. 주황 적은 피하고 청록 코어는 먹으면 됩니다.";
      showMessage("Touch Flight", 1);
    }

    overlay.classList.remove("visible");
    state.playing = true;
    document.body.classList.add("playing");
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
    state.pickupPulse = 0;
    state.cameraShake = 0;
    state.playerFloat = 0;
    state.pointerDown = false;
    player.position.x = 0;
    player.rotation.set(0, 0, 0);
    speedOverlay.style.opacity = "0";
    damageFlash.style.opacity = "0";
    pickupFlash.style.opacity = "0";
  }

  function endRun() {
    state.playing = false;
    document.body.classList.remove("playing");
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
      if (Math.random() < 0.22) {
        spawnPickup();
      } else {
        spawnEnemy();
      }
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
      if (data.kind === "pickup") {
        enemy.position.y = Math.max(
          data.targetY,
          enemy.position.y - data.descentRate * delta * 1.55,
        );
        if (data.type === "boost") {
          enemy.position.x = data.baseX + Math.sin(state.time * 4.5 + data.phase) * data.driftAmp;
          enemy.rotation.x += delta * data.spin;
          enemy.rotation.y += delta * data.spin * 1.2;
          enemy.rotation.z += delta * data.spin * 0.8;
        } else if (data.type === "score") {
          enemy.position.x = data.baseX + Math.sin(state.time * 3.2 + data.phase) * data.driftAmp;
          enemy.rotation.x += delta * data.spin * 0.65;
          enemy.rotation.y += delta * data.spin;
          enemy.rotation.z += delta * data.spin * 0.45;
        } else {
          enemy.position.x = data.baseX + Math.sin(state.time * 2.8 + data.phase) * data.driftAmp;
          enemy.rotation.x += delta * data.spin * 0.8;
          enemy.rotation.y += delta * data.spin;
          enemy.rotation.z += delta * data.spin * 0.5;
        }
        enemy.scale.setScalar(1 + Math.sin(state.time * data.pulse + data.phase) * 0.12);
      } else {
        enemy.position.y = Math.max(
          data.targetY,
          enemy.position.y - data.descentRate * delta * 2.2,
        );
        if (data.type === "rammer") {
          enemy.position.x = THREE.MathUtils.damp(
            enemy.position.x,
            player.position.x * 0.52 + data.baseX * 0.48,
            1.6,
            delta,
          );
          enemy.rotation.x += delta * data.spin;
          enemy.rotation.y += delta * 1.4;
          enemy.rotation.z = THREE.MathUtils.damp(enemy.rotation.z, -player.rotation.z * 0.3, 2, delta);
        } else if (data.type === "sweeper") {
          enemy.position.x = data.baseX + Math.sin(state.time * data.sweepFreq + data.phase) * data.sweepAmp;
          enemy.rotation.x += delta * 0.9;
          enemy.rotation.y += delta * 1.6;
          enemy.rotation.z += delta * data.spin;
        } else {
          enemy.position.x = data.baseX + Math.sin(state.time * 2.2 + data.phase) * data.driftAmp;
          enemy.rotation.x += delta * (0.8 + data.spin * 0.25);
          enemy.rotation.y += delta * 2.6;
          enemy.rotation.z += delta * data.spin;
        }
      }

      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      const dz = enemy.position.z - player.position.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;

      if (
        data.kind === "enemy" &&
        !data.grazed &&
        dz > -1.3 &&
        dz < 0.8 &&
        Math.abs(dx) < data.nearMissX
      ) {
        data.grazed = true;
        state.score += 30;
        showMessage("Near Miss +30", 0.65);
      }

      if (data.kind === "pickup" && distanceSq < data.hitRadius * data.hitRadius) {
        collectPickup(data);
        enemyLayer.remove(enemy);
        state.enemies.splice(index, 1);
        continue;
      }

      if (
        data.kind === "enemy" &&
        state.hitCooldown <= 0 &&
        distanceSq < data.hitRadius * data.hitRadius
      ) {
        registerHit(data);
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

  function registerHit(enemyData) {
    const damage = enemyData && enemyData.damage ? enemyData.damage : 34;
    state.shield = Math.max(0, state.shield - damage);
    state.hitCooldown = 1.15;
    state.invulnBlink = 1.15;
    state.damagePulse = 1;
    state.cameraShake = 1;
    showMessage((enemyData && enemyData.hitMessage) || "Impact", 0.9);

    if (state.shield <= 0) {
      endRun();
    }
  }

  function collectPickup(pickupData) {
    const shieldBefore = state.shield;
    state.shield = Math.min(100, state.shield + (pickupData.shieldReward || 0));
    state.score += pickupData.scoreReward || 0;
    state.speed = Math.min(64, state.speed + (pickupData.speedReward || 0));
    state.pickupPulse = 1;

    const gainedShield = Math.round(state.shield - shieldBefore);
    let label = pickupData.collectMessage || "Core";
    if (gainedShield > 0 && pickupData.type !== "shield") {
      label += " / Shield +" + gainedShield;
    }
    showMessage(label, 0.9);
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
    state.pickupPulse = THREE.MathUtils.damp(state.pickupPulse, 0, 6, delta);
    state.cameraShake = THREE.MathUtils.damp(state.cameraShake, 0, 7, delta);

    const speedPulse = clamp((state.speed - 34) / 26, 0, 1);
    speedOverlay.style.opacity = String(speedPulse * 0.9);
    damageFlash.style.opacity = String(state.damagePulse * 0.8);
    pickupFlash.style.opacity = String(state.pickupPulse * 0.72);

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
