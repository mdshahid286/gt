// Hero visual: four agent nodes (skills/experience/education/fairness colors)
// orbit a wireframe core and stay connected to it by faint lines -- a literal
// depiction of "four independent scores converging toward one decision," not
// a decorative floating-shapes scene.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export function initHeroScene(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 100);
    camera.position.set(0, 0.4, 9);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    function resize() {
        const w = canvas.clientWidth || canvas.parentElement.clientWidth;
        const h = canvas.clientHeight || canvas.parentElement.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);

    // central equilibrium core
    const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.15, 1),
        new THREE.MeshBasicMaterial({ color: 0xf4f5f7, wireframe: true, transparent: true, opacity: 0.45 })
    );
    scene.add(core);

    const innerGlow = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.55, 0),
        new THREE.MeshBasicMaterial({ color: 0x9f7aea, transparent: true, opacity: 0.18 })
    );
    scene.add(innerGlow);

    const agentColors = [0x4fd1c5, 0x9f7aea, 0xf6ad55, 0xf687b3]; // skills, experience, education, fairness
    const orbitGroup = new THREE.Group();
    scene.add(orbitGroup);

    const radius = 3.3;
    const nodes = agentColors.map((color, i) => {
        const angle = (i / agentColors.length) * Math.PI * 2;
        const pos = new THREE.Vector3(
            Math.cos(angle) * radius,
            Math.sin(angle * 0.6) * 1.3,
            Math.sin(angle) * radius
        );

        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.24, 24, 24),
            new THREE.MeshBasicMaterial({ color })
        );
        sphere.position.copy(pos);
        orbitGroup.add(sphere);

        const lineGeom = new THREE.BufferGeometry().setFromPoints([pos.clone(), new THREE.Vector3(0, 0, 0)]);
        const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 }));
        orbitGroup.add(line);

        return { sphere, baseAngle: angle, basePos: pos.clone() };
    });

    let mouseX = 0, mouseY = 0;
    window.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        orbitGroup.rotation.y = t * 0.14 + mouseX * 0.35;
        orbitGroup.rotation.x = mouseY * 0.18;
        core.rotation.y = t * 0.09;
        core.rotation.x = t * 0.05;
        innerGlow.scale.setScalar(1 + Math.sin(t * 1.4) * 0.08);

        nodes.forEach(({ sphere, basePos }, i) => {
            sphere.position.y = basePos.y + Math.sin(t * 1.1 + i * 1.4) * 0.15;
        });

        renderer.render(scene, camera);
    }

    resize();
    animate();
}