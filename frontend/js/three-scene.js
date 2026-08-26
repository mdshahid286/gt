/**
 * three-scene.js — Elegant matte slate structural node animation
 *
 * Designed to look like a premium, bespoke interactive graphic for a SaaS product.
 * A single-color (matte steel-slate) delicate lattice wireframe rotating smoothly
 * and responding to the user's cursor with absolute restraint.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export function initHeroScene(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    // ── Scene / Camera ──
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 8.5);

    function resize() {
        const w = canvas.clientWidth  || canvas.parentElement.clientWidth  || 600;
        const h = canvas.clientHeight || canvas.parentElement.clientHeight || 380;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    // ── Structural Geometry (A double-layered cage representing convergence) ──
    const group = new THREE.Group();
    scene.add(group);

    // Outer lattice - Matte slate
    const outerGeo = new THREE.IcosahedronGeometry(2.2, 1);
    const outerMat = new THREE.MeshBasicMaterial({
        color: 0x4f46e5,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
    });
    const outerLattice = new THREE.Mesh(outerGeo, outerMat);
    group.add(outerLattice);

    // Inner core - Matte slate with slightly more opacity
    const innerGeo = new THREE.IcosahedronGeometry(0.9, 0);
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.08,
    });
    const innerLattice = new THREE.Mesh(innerGeo, innerMat);
    group.add(innerLattice);

    // Add tiny nodes at vertex positions of the outer lattice
    const outerPositions = outerGeo.attributes.position;
    const vertexCount = outerPositions.count;
    const nodeGeometry = new THREE.SphereGeometry(0.045, 12, 12);
    const nodeMaterial = new THREE.MeshBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.5,
    });

    const uniquePositions = [];
    const threshold = 0.01;

    for (let i = 0; i < vertexCount; i++) {
        const x = outerPositions.getX(i);
        const y = outerPositions.getY(i);
        const z = outerPositions.getZ(i);
        const pos = new THREE.Vector3(x, y, z);
        
        let isDuplicate = false;
        for (const upos of uniquePositions) {
            if (upos.distanceTo(pos) < threshold) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            uniquePositions.push(pos);
            const nodeMesh = new THREE.Mesh(nodeGeometry, nodeMaterial);
            nodeMesh.position.copy(pos);
            group.add(nodeMesh);

            // Add a delicate connection line to the center
            const lineGeo = new THREE.BufferGeometry().setFromPoints([pos, new THREE.Vector3(0, 0, 0)]);
            const lineMat = new THREE.LineBasicMaterial({
                color: 0x6366f1,
                transparent: true,
                opacity: 0.08,
            });
            const connection = new THREE.Line(lineGeo, lineMat);
            group.add(connection);
        }
    }

    // ── Mouse parallax (very damp, low-sensitivity) ──
    let targetMX = 0, targetMY = 0, currentMX = 0, currentMY = 0;
    window.addEventListener('mousemove', e => {
        targetMX = (e.clientX / window.innerWidth  - 0.5) * 0.8;
        targetMY = (e.clientY / window.innerHeight - 0.5) * 0.8;
    });

    // ── Animation Loop ──
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        currentMX += (targetMX - currentMX) * 0.05;
        currentMY += (targetMY - currentMY) * 0.05;

        // Elegant, slow rotational speed
        group.rotation.y = t * 0.06 + currentMX;
        group.rotation.x = t * 0.03 + currentMY;

        renderer.render(scene, camera);
    }

    animate();
}