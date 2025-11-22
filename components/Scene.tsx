

import React, { useRef, useMemo, useState, useEffect, useImperativeHandle, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Trail, Billboard, PointerLockControls, Text, Html, Sky, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { BlackHoleParams } from '../types';
import { createWorker } from '../utils/workerBuilder';
import {
    DISK_FRAGMENT_SHADER,
    DISK_VERTEX_SHADER,
    JET_VERTEX_SHADER,
    JET_FRAGMENT_SHADER,
    PHOTON_RING_FRAGMENT_SHADER,
    GRID_VERTEX_SHADER,
    GRID_FRAGMENT_SHADER,
    GALAXY_VERTEX_SHADER,
    GALAXY_FRAGMENT_SHADER,
    NEBULA_VERTEX_SHADER,
    NEBULA_FRAGMENT_SHADER,
    EXPLOSION_VERTEX_SHADER,
    EXPLOSION_FRAGMENT_SHADER,
    LASER_VERTEX_SHADER,
    LASER_FRAGMENT_SHADER,
    ENERGY_PARTICLE_VERTEX_SHADER,
    ENERGY_PARTICLE_FRAGMENT_SHADER,
    DESTRUCTION_VERTEX_SHADER,
    DESTRUCTION_FRAGMENT_SHADER,
    DUST_VERTEX_SHADER,
    DUST_FRAGMENT_SHADER,
    TERRAIN_VERTEX_SHADER,
    TERRAIN_FRAGMENT_SHADER,
    ATMOSPHERE_VERTEX_SHADER,
    ATMOSPHERE_FRAGMENT_SHADER,
    PLANET_ATMOSPHERE_VERTEX_SHADER,
    PLANET_ATMOSPHERE_FRAGMENT_SHADER,
    TEXTURED_GRASS_VERTEX_SHADER,
    TEXTURED_GRASS_FRAGMENT_SHADER,
    TEXTURED_LEAF_VERTEX_SHADER,
    TEXTURED_LEAF_FRAGMENT_SHADER,
    WEATHER_VERTEX_SHADER,
    WEATHER_FRAGMENT_SHADER,
    WATER_FLOW_VERTEX_SHADER,
    WATER_FLOW_FRAGMENT_SHADER,
    ANIME_TOON_VERTEX_SHADER,
    ANIME_TOON_FRAGMENT_SHADER,
    SLASH_VERTEX_SHADER,
    SLASH_FRAGMENT_SHADER,
    PLANETS,
    GALAXIES,
    NEBULAE,
    EXOPLANETS
} from '../constants';

// --- WORKER CODE (Will run in separate thread) ---
const physicsWorkerCode = () => {
    /* eslint-disable-next-line no-restricted-globals */
    const ctx = self as any;

    // Simplified Vector3 class for worker (Pure JS)
    class Vec3 {
        x: number;
        y: number;
        z: number;

        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        add(v: any) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
        sub(v: any) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
        multiplyScalar(s: number) { this.x *= s; this.y *= s; this.z *= s; return this; }
        clone() { return new Vec3(this.x, this.y, this.z); }
        length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
        normalize() { const l = this.length(); if (l > 0) this.multiplyScalar(1 / l); return this; }
        distanceTo(v: any) { return Math.sqrt(Math.pow(this.x - v.x, 2) + Math.pow(this.y - v.y, 2) + Math.pow(this.z - v.z, 2)); }
        lerp(v: any, alpha: number) { this.x += (v.x - this.x) * alpha; this.y += (v.y - this.y) * alpha; this.z += (v.z - this.z) * alpha; return this; }
    }

    ctx.onmessage = (e: any) => {
        const { type, payload } = e.data;

        if (type === 'UPDATE_MISSILES') {
            const { missiles, planets, delta } = payload;
            const updatedMissiles = [];
            const hits = [];

            // Iterate missiles
            for (let i = 0; i < missiles.length; i++) {
                const m = missiles[i];
                const pos = new Vec3(m.position.x, m.position.y, m.position.z);
                const vel = new Vec3(m.velocity.x, m.velocity.y, m.velocity.z);

                m.lifeTime += delta;

                // Guidance Logic
                if (m.targetName) {
                    const targetP = (planets as any[]).find((p: any) => p.name === m.targetName);
                    if (targetP) {
                        const targetPos = new Vec3(targetP.position.x, targetP.position.y, targetP.position.z);

                        // Steering
                        const toTarget = targetPos.clone().sub(pos).normalize();
                        const currentDir = vel.clone().normalize();
                        const steerStrength = 4.0 * delta;
                        const newDir = currentDir.lerp(toTarget, steerStrength).normalize();

                        const speed = 60 + m.lifeTime * 20;
                        vel.x = newDir.x * speed;
                        vel.y = newDir.y * speed;
                        vel.z = newDir.z * speed;

                        // Collision Check
                        if (pos.distanceTo(targetPos) < targetP.size * 2.0) {
                            hits.push({ target: m.targetName, position: pos });
                            continue; // Missile destroyed
                        }
                    }
                }

                pos.add(vel.clone().multiplyScalar(delta));

                if (m.lifeTime < 8.0) {
                    updatedMissiles.push({
                        ...m,
                        position: pos,
                        velocity: vel
                    });
                }
            }

            ctx.postMessage({ type: 'MISSILES_UPDATED', payload: { missiles: updatedMissiles, hits } });
        }
    };
};

interface SceneProps {
    params: BlackHoleParams;
    destination: string | null;
    pilotMode: boolean;
    destroyedPlanets: string[];
    onDestroyPlanet: (name: string) => void;
}

// --- PHYSICS BRIDGE COMPONENT ---
const PhysicsUpdater: React.FC<{
    workerRef: React.MutableRefObject<Worker | null>;
    planetPositionsRef: React.MutableRefObject<{ [key: string]: { x: number, y: number, z: number, size: number } }>;
    missilesDataRef: React.MutableRefObject<any[]>;
}> = ({ workerRef, planetPositionsRef, missilesDataRef }) => {
    useFrame((state, delta) => {
        if (workerRef.current) {
            const pData = Object.entries(planetPositionsRef.current).map(([name, data]) => ({ name, position: data, size: data.size }));
            workerRef.current.postMessage({
                type: 'UPDATE_MISSILES',
                payload: {
                    missiles: missilesDataRef.current,
                    planets: pData,
                    delta: delta
                }
            });
        }
    });
    return null;
}

// --- PROCEDURAL TEXTURE GENERATORS ---
const generateTextureCanvas = (type: 'water' | 'sand' | 'grass' | 'rock' | 'snow') => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    if (type === 'rock') {
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(0, 0, size, size);
        // Layers of sediment
        for (let i = 0; i < 20; i++) {
            const y = Math.random() * size;
            const h = Math.random() * 50 + 10;
            ctx.fillStyle = Math.random() > 0.5 ? '#4a4a4a' : '#666';
            ctx.fillRect(0, y, size, h);
        }
        // Cracks
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        for (let i = 0; i < 30; i++) {
            ctx.beginPath();
            let x = Math.random() * size;
            let y = Math.random() * size;
            ctx.moveTo(x, y);
            for (let j = 0; j < 5; j++) {
                x += (Math.random() - 0.5) * 50;
                y += (Math.random() - 0.5) * 50;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    } else if (type === 'grass') {
        ctx.fillStyle = '#2d4c1e';
        ctx.fillRect(0, 0, size, size);
        // Noise
        for (let i = 0; i < 5000; i++) {
            ctx.fillStyle = `rgba(${Math.random() * 100}, ${100 + Math.random() * 100}, ${Math.random() * 50}, 0.1)`;
            ctx.fillRect(Math.random() * size, Math.random() * size, 4, 4);
        }
        // Flowers
        for (let i = 0; i < 100; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#ffffaa' : '#ffcccc';
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        }
    } else if (type === 'sand') {
        ctx.fillStyle = '#e6c288';
        ctx.fillRect(0, 0, size, size);
        // Ripples
        ctx.strokeStyle = 'rgba(180, 150, 100, 0.2)';
        ctx.lineWidth = 8;
        for (let y = -50; y < size + 50; y += 20) {
            ctx.beginPath();
            for (let x = 0; x < size; x += 10) {
                const dy = Math.sin(x * 0.05 + y * 0.02) * 15;
                ctx.lineTo(x, y + dy);
            }
            ctx.stroke();
        }
    } else if (type === 'snow') {
        ctx.fillStyle = '#f0f8ff';
        ctx.fillRect(0, 0, size, size);
        // Sparkles
        for (let i = 0; i < 500; i++) {
            ctx.fillStyle = '#ffffff';
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.fillRect(x, y, 2, 2);
            if (Math.random() > 0.9) { // Bright sparkle
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
            }
        }
    } else if (type === 'water') {
        ctx.fillStyle = '#4050ff';
        ctx.fillRect(0, 0, size, size);
        // Foam/Waves
        for (let i = 0; i < 200; i++) {
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(Math.random() * size, Math.random() * size, 20 + Math.random() * 50, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
};

const generateAnimeTexture = () => {
    const size = 1024; // High res for sharp eyes
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const hue = Math.random() * 360;
    const skinColor = '#ffe0bd'; // Warmer anime skin
    const eyeColor = `hsl(${(hue + 180) % 360}, 90%, 45%)`;
    const hairColor = `hsl(${hue}, 75%, 25%)`;
    const outfitMain = `hsl(${hue}, 20%, 20%)`; // Dark techwear
    const outfitAccent = `hsl(${hue}, 100%, 60%)`; // Neon

    // 1. FACE (Top Left Quadrant - 0,0 to 512,512)
    ctx.fillStyle = skinColor;
    ctx.fillRect(0, 0, 512, 512);

    const drawAnimeEye = (x: number, y: number, width: number, height: number) => {
        // Sclera
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2); ctx.fill();

        // Eyelashes (Thick upper line)
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x, y - height * 0.3, width * 1.1, 3.6, 5.8);
        ctx.stroke();

        // Iris (Gradient)
        const grad = ctx.createRadialGradient(x, y + height * 0.1, width * 0.1, x, y + height * 0.1, width * 0.6);
        grad.addColorStop(0, eyeColor);
        grad.addColorStop(0.6, '#111'); // Darker edge
        grad.addColorStop(1, eyeColor); // Outer ring
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(x, y + height * 0.1, width * 0.55, height * 0.6, 0, 0, Math.PI * 2); ctx.fill();

        // Pupil
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(x, y + height * 0.1, width * 0.2, height * 0.25, 0, 0, Math.PI * 2); ctx.fill();

        // Highlights (Kawaii)
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(x - width * 0.25, y - height * 0.1, width * 0.15, height * 0.12, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + width * 0.2, y + height * 0.3, width * 0.08, height * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    };

    drawAnimeEye(160, 230, 60, 50); // Left Eye
    drawAnimeEye(352, 230, 60, 50); // Right Eye

    // Nose
    ctx.fillStyle = '#dcb4a0';
    ctx.beginPath(); ctx.moveTo(256, 290); ctx.lineTo(246, 310); ctx.lineTo(266, 310); ctx.fill();

    // Mouth
    ctx.strokeStyle = '#dcb4a0';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(256, 350, 20, 0.1, Math.PI - 0.1); ctx.stroke();

    // Blush
    ctx.fillStyle = 'rgba(255, 100, 100, 0.15)';
    ctx.beginPath(); ctx.ellipse(140, 310, 40, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(372, 310, 40, 20, 0, 0, Math.PI * 2); ctx.fill();


    // 2. BODY / OUTFIT (Right Half - 512,0 to 1024,512)
    ctx.fillStyle = outfitMain;
    ctx.fillRect(512, 0, 512, 512);

    // Tech Lines
    ctx.strokeStyle = outfitAccent;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(600, 0); ctx.lineTo(650, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(900, 0); ctx.lineTo(850, 512); ctx.stroke();

    // Chest Plate
    ctx.fillStyle = '#333';
    ctx.fillRect(650, 100, 200, 200);
    ctx.fillStyle = '#222';
    ctx.fillRect(670, 120, 160, 160);

    // Glowing Core
    ctx.fillStyle = outfitAccent;
    ctx.shadowColor = outfitAccent;
    ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(750, 200, 30, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // 3. LEGS (Bottom Left - 0,512 to 512,1024)
    ctx.fillStyle = '#111'; // Dark pants
    ctx.fillRect(0, 512, 512, 512);

    // Belts/Straps
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 600, 512, 40);
    ctx.fillRect(0, 750, 200, 30); // Thigh strap
    ctx.fillStyle = '#888'; // Buckle
    ctx.fillRect(200, 600, 60, 40);

    // 4. ARMS (Bottom Right - 512,512 to 1024,1024)
    ctx.fillStyle = skinColor; // Sleeveless or rolled up
    ctx.fillRect(512, 512, 512, 512);
    ctx.fillStyle = outfitMain; // Glove/Gauntlet
    ctx.fillRect(512, 800, 512, 224);
    ctx.fillStyle = outfitAccent;
    ctx.fillRect(512, 800, 512, 20); // Wrist band

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;

    return { tex, hairColor, outfitAccent };
};

const generateBuildingTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#d4c5b0';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(160, 140, 120, 0.5)';
    for (let y = 0; y < 256; y += 20) {
        const offset = (y / 20) % 2 === 0 ? 0 : 20;
        for (let x = 0; x < 256; x += 40) {
            ctx.fillRect(x + offset + 2, y + 2, 36, 16);
        }
    }
    ctx.fillStyle = '#4a6fa5';
    ctx.fillRect(60, 60, 50, 60);
    ctx.fillRect(146, 60, 50, 60);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(60, 60, 50, 60);
    ctx.strokeRect(146, 60, 50, 60);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const generateLeafTexture = (type: 'oak' | 'palm' | 'pine') => {
    const canvas = document.createElement('canvas');
    const size = 512;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    if (type === 'oak') {
        for (let i = 0; i < 150; i++) {
            const r = Math.random() * 200;
            const theta = Math.random() * Math.PI * 2;
            const x = size / 2 + r * Math.cos(theta);
            const y = size / 2 + r * Math.sin(theta);
            const scale = 0.6 + Math.random() * 1.0;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.random() * Math.PI * 2);
            ctx.fillStyle = `rgba(${30 + Math.random() * 40}, ${90 + Math.random() * 60}, ${30 + Math.random() * 30}, 0.9)`;
            ctx.beginPath();
            ctx.ellipse(0, 0, 18 * scale, 10 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    } else if (type === 'palm') {
        ctx.translate(size / 2, size);
        ctx.rotate(Math.PI);
        ctx.strokeStyle = "#4b6620";
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0, 250, 20, 480); ctx.stroke();
        for (let y = 50; y < 450; y += 6) {
            const width = 70 * Math.sin((y / 450) * Math.PI);
            ctx.strokeStyle = "#6a8a30";
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y + 30); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(-width, y + 30); ctx.stroke();
        }
    } else if (type === 'pine') {
        ctx.translate(size / 2, size / 2);
        for (let i = 0; i < 500; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 240;
            ctx.save();
            ctx.rotate(angle);
            ctx.translate(dist, 0);
            ctx.fillStyle = `rgba(${15 + Math.random() * 15}, ${55 + Math.random() * 30}, ${20 + Math.random() * 20}, 0.9)`;
            ctx.fillRect(0, -1.5, 50, 3);
            ctx.restore();
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const generateBarkTexture = (type: 'oak' | 'palm' | 'pine' | 'dead') => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const color = type === 'palm' ? '#8d6e63' : type === 'pine' ? '#3e2723' : type === 'dead' ? '#757575' : '#5d4037';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const generateGrassTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    for (let i = 0; i < 25; i++) { // More density
        const xOffset = Math.random() * 40;
        const h = 20 + Math.random() * 40;
        const lean = (Math.random() - 0.5) * 20;
        ctx.fillStyle = `rgb(50, ${120 + Math.random() * 50}, 50)`;
        ctx.beginPath();
        ctx.moveTo(10 + xOffset, 64);
        ctx.quadraticCurveTo(15 + xOffset + lean, 32, 12 + xOffset + lean * 2, 64 - h);
        ctx.quadraticCurveTo(5 + xOffset + lean, 32, 5 + xOffset, 64);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const generateGlareTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256; const cy = 256;
    const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 200);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 255, 200, 0.9)');
    grad.addColorStop(1, 'rgba(255, 100, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * i) / 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * 240, cy + Math.sin(angle) * 240);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// --- ANIME HAIR COMPONENT ---
const AnimeHair: React.FC<{ color: string }> = ({ color }) => {
    // Spiky Anime Hair using cones
    const spikes = useMemo(() => {
        const arr = [];
        // Bangs
        for (let i = 0; i < 5; i++) {
            arr.push({ pos: [(i - 2) * 0.05, 0.15, 0.16], rot: [0.5 + Math.random() * 0.2, 0, (i - 2) * 0.2], scale: [0.8, 1.2, 0.8] });
        }
        // Top Spikes
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            arr.push({ pos: [Math.cos(angle) * 0.08, 0.25, Math.sin(angle) * 0.08], rot: [-0.2, 0, (Math.random() - 0.5)], scale: [1, 1.5, 1] });
        }
        // Back Hair
        arr.push({ pos: [0, 0, -0.1], rot: [-0.8, 0, 0], scale: [1.5, 2.0, 1.5] });

        return arr;
    }, []);

    return (
        <group position={[0, 0.35, 0]}>
            <mesh position={[0, 0, 0]} scale={[1.02, 1.0, 1.02]}>
                <sphereGeometry args={[0.15, 16, 16]} />
                <meshStandardMaterial color={color} roughness={0.2} />
            </mesh>
            {spikes.map((s, i) => (
                <mesh key={i} position={s.pos as any} rotation={s.rot as any} scale={s.scale as any}>
                    <coneGeometry args={[0.05, 0.4, 4]} />
                    <meshStandardMaterial color={color} roughness={0.2} />
                </mesh>
            ))}
        </group>
    )
}

// --- SWORD CHI VFX COMPONENT ---
const SlashEffect: React.FC<{ position: THREE.Vector3, rotation: THREE.Euler, onComplete: () => void }> = ({ position, rotation, onComplete }) => {
    const ref = useRef<THREE.Mesh>(null);
    const [life, setLife] = useState(1.0);

    useFrame((state, delta) => {
        setLife(prev => prev - delta * 3.0);
        if (ref.current) {
            ref.current.position.add(new THREE.Vector3(0, 0, -1).applyEuler(ref.current.rotation).multiplyScalar(delta * 10));
            ref.current.scale.multiplyScalar(1.05);
            (ref.current.material as THREE.ShaderMaterial).uniforms.uOpacity.value = life;
        }
        if (life <= 0) onComplete();
    });

    if (life <= 0) return null;

    return (
        <mesh ref={ref} position={position} rotation={rotation}>
            <planeGeometry args={[2.5, 2.5]} />
            <shaderMaterial
                vertexShader={SLASH_VERTEX_SHADER}
                fragmentShader={SLASH_FRAGMENT_SHADER}
                uniforms={{
                    uColor: { value: new THREE.Color('#00ffff') },
                    uOpacity: { value: 1.0 }
                }}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
            />
        </mesh>
    )
}

// --- HUMAN CHARACTER & AI (ANIME STYLE) ---
const Human: React.FC<{
    position: [number, number, number],
    getHeight: (x: number, z: number) => number,
    sunPosition: THREE.Vector3,
    isPlayer?: boolean,
    rotationY?: number
}> = ({ position, getHeight, sunPosition, isPlayer = false, rotationY }) => {
    const groupRef = useRef<THREE.Group>(null);
    const hipRef = useRef<THREE.Group>(null);
    const leftLegRef = useRef<THREE.Group>(null);
    const rightLegRef = useRef<THREE.Group>(null);
    const leftArmRef = useRef<THREE.Group>(null);
    const rightArmRef = useRef<THREE.Group>(null);
    const capeRef = useRef<THREE.Mesh>(null);
    const swordContainerRef = useRef<THREE.Group>(null);

    // Procedural Anime Texture
    const { tex, hairColor, outfitAccent } = useMemo(() => generateAnimeTexture(), []);

    const baseUniforms = useMemo(() => ({
        uColor: { value: new THREE.Color('#ffffff') },
        uTexture: { value: tex },
        uLightDir: { value: new THREE.Vector3().copy(sunPosition) },
        uRimColor: { value: new THREE.Color('#ffffff') },
        uUvScale: { value: new THREE.Vector2(0.5, 0.5) }, // Map to quadrants
        uUvOffset: { value: new THREE.Vector2(0, 0) }
    }), [tex]);

    const [target, setTarget] = useState(new THREE.Vector3(position[0], position[1], position[2]));
    const [isIdle, setIsIdle] = useState(false);

    // COMBAT STATE
    const [isAttacking, setIsAttacking] = useState(false);
    const [comboIndex, setComboIndex] = useState(0); // 0, 1, 2
    const [attackTime, setAttackTime] = useState(0);
    const [slashes, setSlashes] = useState<{ id: number, pos: THREE.Vector3, rot: THREE.Euler }[]>([]);

    // NPC AI State
    const aiState = useRef<'idle' | 'chase' | 'combat'>('idle');
    const jumpOffset = useRef(0);
    const velocityY = useRef(0);

    // BALANCED WALKING SPEED
    const speed = 0.8 + Math.random() * 0.4;

    const pickNewTarget = useCallback((currentPos: THREE.Vector3) => {
        let attempts = 0;
        while (attempts < 10) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 10 + Math.random() * 15;
            const x = currentPos.x + Math.cos(angle) * dist;
            const z = currentPos.z + Math.sin(angle) * dist;
            const h = getHeight(x, z);
            if (h > 1.5 && h < 10) return new THREE.Vector3(x, h, z);
            attempts++;
        }
        return currentPos;
    }, [getHeight]);

    // USER INPUT (Only if isPlayer)
    useEffect(() => {
        if (!isPlayer) return; // Skip listeners for NPCs

        const handleClick = () => {
            if (isAttacking) {
                if (attackTime > 0.2) { // Queue next combo
                    setComboIndex(prev => (prev + 1) % 3);
                    setAttackTime(0);
                }
            } else {
                setIsAttacking(true);
                setComboIndex(0);
                setAttackTime(0);
            }
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [isPlayer, isAttacking, attackTime]);

    // NPC AI LOGIC (Independent "Consciousness")
    useEffect(() => {
        if (isPlayer) return;

        const interval = setInterval(() => {
            const rand = Math.random();
            if (aiState.current === 'idle') {
                if (rand > 0.7) aiState.current = 'chase';
            } else if (aiState.current === 'chase') {
                if (rand > 0.8) {
                    aiState.current = 'combat';
                    setComboIndex(0);
                    setIsAttacking(true);
                    setAttackTime(0);
                } else if (rand < 0.1) {
                    aiState.current = 'idle';
                }
            } else if (aiState.current === 'combat') {
                if (!isAttacking) { // Finished combo
                    aiState.current = 'idle';
                }
            }
        }, 1000 + Math.random() * 1000);
        return () => clearInterval(interval);
    }, [isPlayer, isAttacking]);


    useFrame((state, delta) => {
        if (!groupRef.current || !hipRef.current) return;

        baseUniforms.uLightDir.value.copy(sunPosition).normalize();
        const t = state.clock.elapsedTime;

        // --- PLAYER ROTATION SYNC ---
        if (isPlayer && rotationY !== undefined) {
            groupRef.current.rotation.y = rotationY;
        }

        // --- COMBAT LOGIC ---
        if (isAttacking) {
            setAttackTime(prev => prev + delta * 3.0); // Attack Speed

            // NPC Auto-Combo logic
            if (!isPlayer && attackTime > 0.8 && comboIndex < 2) {
                setComboIndex(prev => prev + 1);
                setAttackTime(0);
                // Random Jump during combo
                if (comboIndex === 1 && Math.random() > 0.5) {
                    velocityY.current = 5.0;
                }
            }

            // JUMP ATTACK PHYSICS
            if (comboIndex === 2 || velocityY.current > 0) {
                // On 3rd hit (spin) or triggered jump, fly up
                if (comboIndex === 2 && attackTime < 0.1) velocityY.current = 8.0; // Launch

                velocityY.current -= delta * 20.0; // Gravity
                jumpOffset.current += velocityY.current * delta;
                if (jumpOffset.current < 0) {
                    jumpOffset.current = 0;
                    velocityY.current = 0;
                }
            }

            // DASH EFFECT (1st hit)
            if (comboIndex === 0 && attackTime < 0.2) {
                const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(groupRef.current.quaternion);
                // If player, forward is +Z relative to camera/player rotation?
                // We assume model's forward is aligned with movement direction logic in SurfaceWorld
                // In ThreeJS, Forward is -Z usually. Let's verify model orientation.
                // SurfaceWorld moves playerPos.
                // Here we just visual dash. 
                // For player, position is controlled by parent. We shouldn't modify position here?
                // Actually, we modify visual position offset if we want, OR SurfaceWorld handles movement.
                // For visuals, we can move the group slightly.
                if (!isPlayer) {
                    groupRef.current.position.add(fwd.multiplyScalar(delta * 5));
                } else {
                    // For player, visual dash effect only? Or let physics handle?
                    // Let's allow small visual lunge
                    // groupRef.current.position.add(fwd.multiplyScalar(delta * 2));
                }
            }

            // Trigger VFX once per attack at specific frame
            if (attackTime > 0.3 && attackTime < 0.35) {
                const id = Math.random();
                // Direction relative to model rotation
                const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(groupRef.current.quaternion);
                const spawnPos = groupRef.current.position.clone().add(new THREE.Vector3(0, 1.5 + jumpOffset.current, 0)).add(forward);

                let rot = groupRef.current.rotation.clone();
                if (comboIndex === 0) { /* Vertical */ }
                else if (comboIndex === 1) { rot.z = Math.PI / 2; /* Horizontal */ }
                else { rot.x = Math.PI / 4; /* Diagonal Spin */ }

                setSlashes(prev => [...prev, { id, pos: spawnPos, rot }]);
            }

            // End attack
            if (attackTime > 1.0) {
                if (comboIndex === 2 || (isPlayer && attackTime > 1.0)) {
                    setIsAttacking(false);
                    setAttackTime(0);
                    setComboIndex(0);
                }
            }

            // Procedural Combat Animation
            const progress = Math.min(attackTime, 1.0);

            // Move Sword to Hand
            if (swordContainerRef.current && rightArmRef.current) {
                swordContainerRef.current.position.set(0.4, 0.2, 0.5);
                swordContainerRef.current.rotation.set(Math.PI / 2, 0, Math.PI / 2);
            }

            if (comboIndex === 0) {
                // Vertical Slash
                if (rightArmRef.current) {
                    rightArmRef.current.rotation.x = THREE.MathUtils.lerp(-2.5, 1.0, progress); // Raise high then swing down
                    rightArmRef.current.rotation.z = -0.2;
                }
                if (leftArmRef.current) leftArmRef.current.rotation.x = 0.5;
                hipRef.current.rotation.y = THREE.MathUtils.lerp(-0.5, 0.5, progress);
            } else if (comboIndex === 1) {
                // Horizontal Slash
                if (rightArmRef.current) {
                    rightArmRef.current.rotation.x = 0;
                    rightArmRef.current.rotation.y = THREE.MathUtils.lerp(1.5, -1.5, progress); // Swing right to left
                    rightArmRef.current.rotation.z = -1.5;
                }
                hipRef.current.rotation.y = THREE.MathUtils.lerp(1.0, -1.0, progress);
            } else {
                // Spin Slash
                groupRef.current.rotation.y += delta * 15.0;
                if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
                if (rightArmRef.current) rightArmRef.current.rotation.z = -1.5;
            }

            // Apply Jump Offset
            if (groupRef.current) groupRef.current.position.y += jumpOffset.current;

            // Correct position Y after jump frame (hacky but works for visual sync)
            const currentPos = groupRef.current.position;
            const terrainH = getHeight(currentPos.x, currentPos.z);
            if (groupRef.current.position.y < terrainH) groupRef.current.position.y = terrainH;

            return; // Skip walk logic while attacking
        } else {
            // Reset Sword to Back
            if (swordContainerRef.current) {
                swordContainerRef.current.position.set(0, 0.5, -0.2);
                swordContainerRef.current.rotation.set(0, 0, -0.7);
            }
            hipRef.current.rotation.y = 0;
            jumpOffset.current = 0;
        }


        // --- MOVEMENT LOGIC ---
        const currentPos = groupRef.current.position;

        if (isPlayer) {
            // For player, we override the position with the prop passed from parent (synced with physics)
            // BUT, we must update the mesh position ref to match the physics position
            // `position` prop changes? No, `playerPos` object in SurfaceWorld mutates? 
            // No, React re-renders on state change.
            // If SurfaceWorld renders <Human position={[x,y,z]} />, it updates on render.
            // But for 60fps physics, we might need to use the ref or just trust React's update if it's fast enough.
            // Given the complexity, let's rely on the prop update for now, but ensure y offset is handled.

            // Actually, SurfaceWorld passes [playerPos.x, playerPos.y - 4, playerPos.z]
            // So we just respect that.
            // We add Walking Animation here based on movement?
            // We can detect movement by checking delta position.

            // Simple Idle animation for player if not moving?
            // Let's just apply idle breath for now.
            hipRef.current.position.y = 1.8 + Math.sin(t * 2) * 0.02;
            return;
        }

        const distToTarget = currentPos.distanceTo(new THREE.Vector3(target.x, currentPos.y, target.z));

        // Cape Physics
        if (capeRef.current) {
            const vertices = capeRef.current.geometry.attributes.position;
            for (let i = 0; i < vertices.count; i++) {
                const y = vertices.getY(i);
                if (y < 0) {
                    const x = vertices.getX(i);
                    // More dynamic wave
                    vertices.setZ(i, Math.sin(t * 5 + x * 3) * 0.1 + (isIdle ? -0.05 : -0.2));
                }
            }
            vertices.needsUpdate = true;
        }

        if (distToTarget < 0.5) {
            if (!isIdle) {
                setIsIdle(true);
                setTimeout(() => {
                    setTarget(pickNewTarget(currentPos));
                    setIsIdle(false);
                }, 2000 + Math.random() * 3000);
            }
            // Idle Breath
            hipRef.current.position.y = 1.8 + Math.sin(t * 2) * 0.02;
            if (leftArmRef.current) { leftArmRef.current.rotation.x = 0; leftArmRef.current.rotation.z = 0.1 + Math.sin(t) * 0.02; }
            if (rightArmRef.current) { rightArmRef.current.rotation.x = 0; rightArmRef.current.rotation.z = -0.1 - Math.sin(t) * 0.02; }
            if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
            if (rightLegRef.current) rightLegRef.current.rotation.x = 0;

        } else {
            // Movement Logic (NPC)
            // Speed boost if chasing
            const moveSpeed = aiState.current === 'chase' ? speed * 2.5 : speed;

            const dir = new THREE.Vector3(target.x - currentPos.x, 0, target.z - currentPos.z).normalize();
            groupRef.current.lookAt(target.x, currentPos.y, target.z);

            const moveDist = moveSpeed * delta;
            const newPos = currentPos.clone().add(dir.multiplyScalar(moveDist));
            const h = getHeight(newPos.x, newPos.z);
            newPos.y = h;
            groupRef.current.position.copy(newPos);

            // SYNCHRONIZED WALK CYCLE
            const walkT = t * 10.0 * (aiState.current === 'chase' ? 1.5 : 1.0);

            if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(walkT) * 0.8;
            if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(walkT + Math.PI) * 0.8;

            if (leftArmRef.current) {
                leftArmRef.current.rotation.x = Math.sin(walkT + Math.PI) * 0.6;
                leftArmRef.current.rotation.z = 0.15;
            }
            if (rightArmRef.current) {
                rightArmRef.current.rotation.x = Math.sin(walkT) * 0.6;
                rightArmRef.current.rotation.z = -0.15;
            }
            // Bounce
            hipRef.current.position.y = 1.8 + Math.abs(Math.sin(walkT)) * 0.1;
        }
    });

    const getPartUniforms = (offsetX: number, offsetY: number) => ({
        ...baseUniforms,
        uUvOffset: { value: new THREE.Vector2(offsetX, offsetY) }
    });

    return (
        <group ref={groupRef} position={position}>
            {slashes.map(s => (
                <SlashEffect key={s.id} position={s.pos} rotation={s.rot} onComplete={() => setSlashes(prev => prev.filter(x => x.id !== s.id))} />
            ))}

            <group ref={hipRef} position={[0, 1.8, 0]}>

                {/* ACCESSORY: SCI-FI SWORD (PARENTED TO HIPS INITIALLY) */}
                <group ref={swordContainerRef} position={[0, 0.5, -0.2]} rotation={[0, 0, -0.7]}>
                    <mesh position={[0, 0.4, 0]}>
                        <boxGeometry args={[0.1, 0.3, 0.05]} />
                        <meshStandardMaterial color="#333" />
                    </mesh>
                    <mesh position={[0, -0.4, 0]}>
                        <boxGeometry args={[0.08, 1.2, 0.02]} />
                        <meshStandardMaterial color="#aaa" emissive={outfitAccent} emissiveIntensity={isAttacking ? 2.0 : 0.5} />
                    </mesh>
                    <mesh position={[0, 0.25, 0]}>
                        <boxGeometry args={[0.3, 0.05, 0.05]} />
                        <meshStandardMaterial color="#555" />
                    </mesh>
                </group>

                <mesh ref={capeRef} position={[0, 0.8, -0.15]} rotation={[0.1, 0, 0]}>
                    <planeGeometry args={[0.6, 1.4, 4, 8]} />
                    <meshStandardMaterial color={hairColor} side={THREE.DoubleSide} roughness={0.9} />
                </mesh>

                {/* TORSO (UV: Top Right) */}
                <mesh position={[0, 0.5, 0]}>
                    <capsuleGeometry args={[0.16, 0.5, 4, 8]} />
                    <shaderMaterial vertexShader={ANIME_TOON_VERTEX_SHADER} fragmentShader={ANIME_TOON_FRAGMENT_SHADER} uniforms={getPartUniforms(0.5, 0.0)} />
                </mesh>

                {/* HEAD (UV: Top Left) */}
                <group position={[0, 1.05, 0]}>
                    <mesh rotation={[0, -Math.PI / 2, 0]}> {/* Rotate so face texture looks forward */}
                        <sphereGeometry args={[0.18, 32, 32]} />
                        <shaderMaterial vertexShader={ANIME_TOON_VERTEX_SHADER} fragmentShader={ANIME_TOON_FRAGMENT_SHADER} uniforms={getPartUniforms(0.0, 0.5)} />
                    </mesh>
                    <AnimeHair color={hairColor} />
                </group>

                {/* ARMS (UV: Bottom Right) */}
                <group position={[-0.25, 0.8, 0]} ref={leftArmRef}>
                    <mesh position={[0, -0.35, 0]}>
                        <capsuleGeometry args={[0.05, 0.7, 4, 8]} />
                        <shaderMaterial vertexShader={ANIME_TOON_VERTEX_SHADER} fragmentShader={ANIME_TOON_FRAGMENT_SHADER} uniforms={getPartUniforms(0.5, 0.5)} />
                    </mesh>
                </group>
                <group position={[0.25, 0.8, 0]} ref={rightArmRef}>
                    <mesh position={[0, -0.35, 0]}>
                        <capsuleGeometry args={[0.05, 0.7, 4, 8]} />
                        <shaderMaterial vertexShader={ANIME_TOON_VERTEX_SHADER} fragmentShader={ANIME_TOON_FRAGMENT_SHADER} uniforms={getPartUniforms(0.5, 0.5)} />
                    </mesh>
                </group>

                {/* HIPS (UV: Top Right - reuse torso texture) */}
                <mesh position={[0, 0.1, 0]}>
                    <capsuleGeometry args={[0.17, 0.2, 4, 8]} />
                    <shaderMaterial vertexShader={ANIME_TOON_VERTEX_SHADER} fragmentShader={ANIME_TOON_FRAGMENT_SHADER} uniforms={getPartUniforms(0.5, 0.0)} />
                </mesh>

                {/* LEGS (UV: Bottom Left) */}
                <group position={[-0.1, 0.1, 0]} ref={leftLegRef}>
                    <mesh position={[0, -0.55, 0]}>
                        <capsuleGeometry args={[0.07, 1.1, 4, 8]} />
                        <shaderMaterial vertexShader={ANIME_TOON_VERTEX_SHADER} fragmentShader={ANIME_TOON_FRAGMENT_SHADER} uniforms={getPartUniforms(0.0, 0.0)} />
                    </mesh>
                    {/* Shoe */}
                    <mesh position={[0, -1.1, 0.08]}>
                        <boxGeometry args={[0.1, 0.12, 0.25]} />
                        <meshStandardMaterial color="#222" />
                    </mesh>
                </group>

                <group position={[0.1, 0.1, 0]} ref={rightLegRef}>
                    <mesh position={[0, -0.55, 0]}>
                        <capsuleGeometry args={[0.07, 1.1, 4, 8]} />
                        <shaderMaterial vertexShader={ANIME_TOON_VERTEX_SHADER} fragmentShader={ANIME_TOON_FRAGMENT_SHADER} uniforms={getPartUniforms(0.0, 0.0)} />
                    </mesh>
                    {/* Shoe */}
                    <mesh position={[0, -1.1, 0.08]}>
                        <boxGeometry args={[0.1, 0.12, 0.25]} />
                        <meshStandardMaterial color="#222" />
                    </mesh>
                </group>

            </group>
        </group>
    )
}

const Population: React.FC<{ count: number; getHeight: (x: number, z: number) => number; sunPosition: THREE.Vector3 }> = React.memo(({ count, getHeight, sunPosition }) => {
    const spawnPoints = useMemo(() => {
        const arr = [];
        let attempts = 0;
        let added = 0;
        while (added < count && attempts < count * 10) {
            attempts++;
            const r = Math.random() * 150; // Reduced radius to keep them closer
            const theta = Math.random() * Math.PI * 2;
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);
            const h = getHeight(x, z);

            if (h > 2.0 && h < 8.0) {
                arr.push([x, h, z]);
                added++;
            }
        }
        return arr;
    }, [count, getHeight]);

    return (
        <group>
            {spawnPoints.map((pos, i) => (
                <Human key={i} position={pos as [number, number, number]} getHeight={getHeight} sunPosition={sunPosition} isPlayer={false} />
            ))}
        </group>
    );
});

// --- VILLAGE COMPONENT (HOUSES) ---
const Village: React.FC<{ count: number; getHeight: (x: number, z: number) => number }> = ({ count, getHeight }) => {
    const bodyMesh = useRef<THREE.InstancedMesh>(null);
    const roofMesh = useRef<THREE.InstancedMesh>(null);
    const wallTex = useMemo(() => generateBuildingTexture(), []);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useEffect(() => {
        if (!bodyMesh.current || !roofMesh.current) return;
        let i = 0;
        let attempts = 0;

        while (i < count && attempts < count * 10) {
            attempts++;
            const x = (Math.random() - 0.5) * 300;
            const z = (Math.random() - 0.5) * 300;
            const h = getHeight(x, z);

            // Slope check
            const hR = getHeight(x + 2, z);
            const hF = getHeight(x, z + 2);
            const slope = Math.max(Math.abs(hR - h), Math.abs(hF - h));

            // Only build on flat land above water
            if (h > 2.0 && h < 10.0 && slope < 0.5) {
                // House Body
                dummy.position.set(x, h + 1.5, z); // 3 height box, center is 1.5
                dummy.scale.set(3, 3, 3);
                dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
                dummy.updateMatrix();
                bodyMesh.current.setMatrixAt(i, dummy.matrix);

                // House Roof
                const roofDummy = dummy.clone();
                roofDummy.position.y += 2.5; // Move roof up
                roofDummy.scale.set(3.5, 2, 3.5);
                roofDummy.rotateY(Math.PI / 4);
                roofDummy.updateMatrix();
                roofMesh.current.setMatrixAt(i, roofDummy.matrix);

                i++;
            }
        }
        bodyMesh.current.count = i;
        roofMesh.current.count = i;
        bodyMesh.current.instanceMatrix.needsUpdate = true;
        roofMesh.current.instanceMatrix.needsUpdate = true;
    }, [count, getHeight, dummy]);

    return (
        <group>
            <instancedMesh ref={bodyMesh} args={[undefined, undefined, count]} castShadow receiveShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial map={wallTex} roughness={0.8} />
            </instancedMesh>
            <instancedMesh ref={roofMesh} args={[undefined, undefined, count]} castShadow receiveShadow>
                <coneGeometry args={[0.7, 1, 4]} />
                <meshStandardMaterial color="#8d6e63" roughness={0.6} />
            </instancedMesh>
        </group>
    )
}


// --- ADVANCED MULTI-BIOME VEGETATION ---
const MultiBiomeVegetation: React.FC<{ count: number; planetData: any; getHeight: (x: number, z: number) => number }> = ({ count, planetData, getHeight }) => {
    const oakRef = useRef<THREE.InstancedMesh>(null);
    const pineRef = useRef<THREE.InstancedMesh>(null);
    const palmRef = useRef<THREE.InstancedMesh>(null);
    const deadRef = useRef<THREE.InstancedMesh>(null);
    const foliageRefs = useRef<THREE.InstancedMesh[]>([]);

    const texOakLeaf = useMemo(() => generateLeafTexture('oak'), []);
    const texPineLeaf = useMemo(() => generateLeafTexture('pine'), []);
    const texPalmLeaf = useMemo(() => generateLeafTexture('palm'), []);

    const texOakBark = useMemo(() => generateBarkTexture('oak'), []);
    const texPineBark = useMemo(() => generateBarkTexture('pine'), []);
    const texPalmBark = useMemo(() => generateBarkTexture('palm'), []);
    const texDeadBark = useMemo(() => generateBarkTexture('dead'), []);

    // --- GEOMETRY GENERATORS (FRACTAL TREES) ---
    const createTreeGeometry = useCallback((type: 'oak' | 'pine' | 'palm' | 'dead') => {
        const branches: THREE.BufferGeometry[] = [];
        const leaves: THREE.BufferGeometry[] = [];

        const addBranch = (start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number) => {
            if (depth === 0) {
                if (type !== 'dead') {
                    for (let k = 0; k < 3; k++) {
                        const lc = new THREE.PlaneGeometry(length * 2.5, length * 2.5);
                        const dummy = new THREE.Object3D();
                        dummy.position.copy(start);
                        dummy.lookAt(start.clone().add(dir));
                        dummy.rotateZ(k * Math.PI / 1.5);
                        dummy.updateMatrix();
                        lc.applyMatrix4(dummy.matrix);
                        leaves.push(lc);
                    }
                }
                return;
            }

            const end = start.clone().add(dir.clone().multiplyScalar(length));
            const limb = new THREE.CylinderGeometry(radius * 0.7, radius, length, 5);
            limb.translate(0, length / 2, 0);
            limb.lookAt(new THREE.Vector3(0, 1, 0));
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
            limb.applyQuaternion(q);
            limb.translate(start.x, start.y, start.z);
            branches.push(limb);

            const count = type === 'oak' ? 2 : type === 'pine' ? 3 : 1;
            for (let i = 0; i < count; i++) {
                const spread = type === 'pine' ? 0.8 : 1.2;
                const newDir = dir.clone().applyAxisAngle(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize(), spread);
                addBranch(end, newDir, length * 0.7, radius * 0.7, depth - 1);
            }
        };

        if (type === 'oak') {
            addBranch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 2.0, 0.5, 4);
        } else if (type === 'pine') {
            const trunk = new THREE.CylinderGeometry(0.2, 0.6, 8, 6);
            trunk.translate(0, 4, 0);
            branches.push(trunk);
            for (let h = 2; h < 8; h += 1.0) {
                const r = (8 - h) * 0.7;
                for (let i = 0; i < 5; i++) {
                    const l = new THREE.PlaneGeometry(2.0, 2.0);
                    const angle = i / 5 * Math.PI * 2 + Math.random();
                    l.rotateX(Math.PI / 2);
                    l.rotateZ(angle);
                    l.rotateX(0.2);
                    l.translate(Math.cos(angle) * r * 0.5, h, Math.sin(angle) * r * 0.5);
                    leaves.push(l);
                }
            }
        } else if (type === 'palm') {
            let pos = new THREE.Vector3(0, 0, 0);
            let dir = new THREE.Vector3(0, 1, 0);
            for (let i = 0; i < 6; i++) {
                const len = 0.8;
                const limb = new THREE.CylinderGeometry(0.25 - i * 0.02, 0.3 - i * 0.02, len, 6);
                limb.translate(0, len / 2, 0);
                const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                limb.applyQuaternion(q);
                limb.translate(pos.x, pos.y, pos.z);
                branches.push(limb);
                pos.add(dir.multiplyScalar(len));
                dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.1);
            }
            const l = new THREE.PlaneGeometry(3, 3);
            l.translate(0, 1.5, 0);
            for (let i = 0; i < 8; i++) {
                const lc = l.clone();
                lc.rotateX(-Math.PI / 3);
                lc.rotateY(i / 8 * Math.PI * 2);
                lc.translate(pos.x, pos.y, pos.z);
                leaves.push(lc);
            }
        } else if (type === 'dead') {
            addBranch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 1.5, 0.3, 3);
        }

        const merge = (geos: THREE.BufferGeometry[]) => {
            if (geos.length === 0) return new THREE.BufferGeometry();
            let posCount = 0; geos.forEach(g => posCount += g.attributes.position.count);
            const posArr = new Float32Array(posCount * 3);
            const uvArr = new Float32Array(posCount * 2);
            let offset = 0;
            geos.forEach(g => {
                posArr.set(g.attributes.position.array, offset * 3);
                const uvs = g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2);
                uvArr.set(uvs, offset * 2);
                offset += g.attributes.position.count;
            });
            const final = new THREE.BufferGeometry();
            final.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
            final.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
            final.computeVertexNormals();
            return final;
        }

        return { wood: merge(branches), foliage: merge(leaves) };
    }, []);

    const geometries = useMemo(() => ({
        oak: createTreeGeometry('oak'),
        pine: createTreeGeometry('pine'),
        palm: createTreeGeometry('palm'),
        dead: createTreeGeometry('dead')
    }), [createTreeGeometry]);

    useEffect(() => {
        if (!oakRef.current) return;
        const dummy = new THREE.Object3D();
        let idxOak = 0, idxPine = 0, idxPalm = 0, idxDead = 0;

        for (let i = 0; i < count * 1.5; i++) {
            const x = (Math.random() - 0.5) * 380;
            const z = (Math.random() - 0.5) * 380;
            const h = getHeight(x, z);
            const d = 1.0;
            const hR = getHeight(x + d, z);
            const hF = getHeight(x, z + d);
            const slope = Math.max(Math.abs(hR - h), Math.abs(hF - h));

            let type = '';
            if (h > -1.0 && h < 1.5 && slope < 0.5) type = 'palm';
            else if (h >= 1.5 && h < 8.0 && slope < 1.0) type = 'oak';
            else if (h >= 5.0 && h < 16.0 && slope > 0.5) type = 'pine';
            else if (h >= 10.0 && h < 20.0 && slope > 1.2) type = 'dead';

            let targetMesh = null;
            let targetFoliage = null;
            let idx = 0;

            if (type === 'palm' && idxPalm < count / 4) { targetMesh = palmRef.current; targetFoliage = foliageRefs.current[2]; idx = idxPalm++; }
            else if (type === 'oak' && idxOak < count / 2) { targetMesh = oakRef.current; targetFoliage = foliageRefs.current[0]; idx = idxOak++; }
            else if (type === 'pine' && idxPine < count / 3) { targetMesh = pineRef.current; targetFoliage = foliageRefs.current[1]; idx = idxPine++; }
            else if (type === 'dead' && idxDead < count / 5) { targetMesh = deadRef.current; idx = idxDead++; }

            if (targetMesh) {
                dummy.position.set(x, h - 0.2, z);
                const s = 0.8 + Math.random() * 0.4;
                dummy.scale.set(s, s * (0.9 + Math.random() * 0.2), s);
                dummy.rotation.y = Math.random() * Math.PI * 2;
                dummy.rotation.x = (Math.random() - 0.5) * 0.2;
                dummy.rotation.z = (Math.random() - 0.5) * 0.2;
                dummy.updateMatrix();
                targetMesh.setMatrixAt(idx, dummy.matrix);
                if (targetFoliage) targetFoliage.setMatrixAt(idx, dummy.matrix);
            }
        }

        [oakRef, pineRef, palmRef, deadRef].forEach(r => { if (r.current) r.current.instanceMatrix.needsUpdate = true; });
        foliageRefs.current.forEach(r => { if (r) r.instanceMatrix.needsUpdate = true; });

    }, [count, getHeight, geometries]);

    return (
        <group>
            <instancedMesh ref={oakRef} args={[undefined, undefined, count / 2]} geometry={geometries.oak.wood} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial map={texOakBark} />
            </instancedMesh>
            <instancedMesh ref={(el) => foliageRefs.current[0] = el!} args={[undefined, undefined, count / 2]} geometry={geometries.oak.foliage} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial map={texOakLeaf} transparent alphaTest={0.5} side={THREE.DoubleSide} />
            </instancedMesh>

            <instancedMesh ref={pineRef} args={[undefined, undefined, count / 3]} geometry={geometries.pine.wood} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial map={texPineBark} />
            </instancedMesh>
            <instancedMesh ref={(el) => foliageRefs.current[1] = el!} args={[undefined, undefined, count / 3]} geometry={geometries.pine.foliage} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial map={texPineLeaf} transparent alphaTest={0.5} side={THREE.DoubleSide} />
            </instancedMesh>

            <instancedMesh ref={palmRef} args={[undefined, undefined, count / 4]} geometry={geometries.palm.wood} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial map={texPalmBark} />
            </instancedMesh>
            <instancedMesh ref={(el) => foliageRefs.current[2] = el!} args={[undefined, undefined, count / 4]} geometry={geometries.palm.foliage} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial map={texPalmLeaf} transparent alphaTest={0.5} side={THREE.DoubleSide} />
            </instancedMesh>

            <instancedMesh ref={deadRef} args={[undefined, undefined, count / 5]} geometry={geometries.dead.wood} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial map={texDeadBark} />
            </instancedMesh>
        </group>
    )
}

// --- REALISTIC GRASS COMPONENT ---
const GrassField: React.FC<{ count: number; planetData: any; getHeight: (x: number, z: number) => number }> = ({ count, planetData, getHeight }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const grassTex = useMemo(() => generateGrassTexture(), []);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uWindSpeed: { value: 2.0 },
        uColor: { value: new THREE.Color(planetData.surface.grass) },
        uTexture: { value: grassTex }
    }), [planetData, grassTex]);

    useEffect(() => {
        if (!meshRef.current) return;
        let i = 0;
        let attempts = 0;
        while (i < count && attempts < count * 5) {
            attempts++;
            const x = (Math.random() - 0.5) * 350;
            const z = (Math.random() - 0.5) * 350;
            const h = getHeight(x, z);
            if (h > 1.5 && h < 12.0) {
                dummy.position.set(x, h - 0.1, z);
                const s = 1.2 + Math.random() * 1.5;
                dummy.scale.set(s, s * (0.8 + Math.random() * 0.4), s);
                dummy.rotation.y = Math.random() * Math.PI * 2;
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);
                i++;
            }
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [count, getHeight, dummy]);

    useFrame((state) => {
        if (meshRef.current) {
            (meshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.getElapsedTime();
        }
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false} receiveShadow>
            <planeGeometry args={[1.0, 1.5]} />
            <shaderMaterial
                vertexShader={TEXTURED_GRASS_VERTEX_SHADER}
                fragmentShader={TEXTURED_GRASS_FRAGMENT_SHADER}
                uniforms={uniforms}
                side={THREE.DoubleSide}
                transparent
                depthWrite={false}
            />
        </instancedMesh>
    )
}

// --- WEATHER SYSTEM (RAIN/SNOW) ---
const WeatherSystem: React.FC<{ planetData: any; playerPos: THREE.Vector3 }> = ({ planetData, playerPos }) => {
    const pointsRef = useRef<THREE.Points>(null);
    if (!planetData.weather) return null;
    const weatherType = planetData.weather === 'rain' ? 1 : 0;
    const particleCount = weatherType === 1 ? 1500 : 1000;
    const weatherColor = new THREE.Color(planetData.weatherColor || '#ffffff');
    const fallSpeed = weatherType === 1 ? 40.0 : 3.0;

    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(particleCount * 3);
        const random = new Float32Array(particleCount);
        const range = 40;
        for (let i = 0; i < particleCount; i++) {
            pos[i * 3] = (Math.random() - 0.5) * range * 2;
            pos[i * 3 + 1] = Math.random() * 80;
            pos[i * 3 + 2] = (Math.random() - 0.5) * range * 2;
            random[i] = Math.random();
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aRandom', new THREE.BufferAttribute(random, 1));
        return geo;
    }, [particleCount]);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uSpeed: { value: fallSpeed },
        uColor: { value: weatherColor },
        uType: { value: weatherType },
        uCenter: { value: new THREE.Vector3() }
    }), [fallSpeed, weatherColor, weatherType]);

    useFrame((state) => {
        if (pointsRef.current) {
            const mat = pointsRef.current.material as THREE.ShaderMaterial;
            mat.uniforms.uTime.value = state.clock.getElapsedTime();
            pointsRef.current.position.x = playerPos.x;
            pointsRef.current.position.z = playerPos.z;
        }
    });

    return (
        <points ref={pointsRef} geometry={geometry}>
            <shaderMaterial
                vertexShader={WEATHER_VERTEX_SHADER}
                fragmentShader={WEATHER_FRAGMENT_SHADER}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </points>
    )
}

// --- SURFACE WORLD COMPONENT (Walking Simulator) ---
const SurfaceWorld: React.FC<{ planetData: any; onTakeOff: () => void }> = ({ planetData, onTakeOff }) => {
    const { scene } = useThree();
    const controlsRef = useRef<any>(null);
    const waterMeshRef = useRef<THREE.Mesh>(null);
    const [playerPos] = useState(new THREE.Vector3(0, 50, 0));
    const [playerRotationY, setPlayerRotationY] = useState(0);

    const [sunPosition, setSunPosition] = useState(new THREE.Vector3(100, 20, 100));
    const sunGlareTex = useMemo(() => generateGlareTexture(), []);

    // --- PROCEDURAL TEXTURE GENERATION ---
    const uTexWater = useMemo(() => generateTextureCanvas('water'), []);
    const uTexSand = useMemo(() => generateTextureCanvas('sand'), []);
    const uTexGrass = useMemo(() => generateTextureCanvas('grass'), []);
    const uTexRock = useMemo(() => generateTextureCanvas('rock'), []);
    const uTexSnow = useMemo(() => generateTextureCanvas('snow'), []);

    // --- HEIGHT GENERATION LOGIC ---
    const getRawHeight = useCallback((x: number, z: number) => {
        const scale = planetData.surface.scale || 1.0;
        const pX = x * 0.02 * scale;
        const pZ = z * 0.02 * scale;
        let base = Math.sin(pX * 0.5) * Math.cos(pZ * 0.5) + Math.sin(pX * 0.2 + pZ * 0.1) * 0.5;
        let h = 0.0;
        if (base < -0.2) {
            h = base * 4.0;
        } else if (base < 0.4) {
            h = Math.pow(base, 2.0) * 2.0;
            h += Math.sin(pX * 10.0) * 0.1;
        } else {
            const mask = smoothstep(0.4, 0.6, base);
            const ridge = Math.abs(Math.sin(pX * 4.0 + Math.sin(pZ * 2.0))) * 5.0;
            const detail = Math.sin(pX * 15.0) * 0.5;
            h = (base * 5.0) + (ridge + detail) * mask;
        }
        return h;
    }, [planetData.surface.scale]);

    const smoothstep = (min: number, max: number, value: number) => {
        const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
        return x * x * (3 - 2 * x);
    };

    const { geometry, heightMap, gridSize, segments } = useMemo(() => {
        const SIZE = 400;
        const SEGMENTS = 256;
        const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
        const count = geo.attributes.position.count;
        const arr = geo.attributes.position.array;
        const heights = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const x = arr[i * 3];
            const y = arr[i * 3 + 1];
            const h = getRawHeight(x, -y);
            arr[i * 3 + 2] = h;
            heights[i] = h;
        }
        geo.computeVertexNormals();
        return { geometry: geo, heightMap: heights, gridSize: SIZE, segments: SEGMENTS };
    }, [getRawHeight]);

    const getBarycentricHeight = useCallback((x: number, z: number) => {
        const halfSize = gridSize / 2;
        const cellSize = gridSize / segments;
        const gridX = (x + halfSize) / cellSize;
        const gridY = (z + halfSize) / cellSize;
        const ix = Math.floor(gridX);
        const iy = Math.floor(gridY);
        if (ix < 0 || ix >= segments || iy < 0 || iy >= segments) return -100;
        const rowSize = segments + 1;
        const i00 = iy * rowSize + ix;
        const i10 = iy * rowSize + (ix + 1);
        const i01 = (iy + 1) * rowSize + ix;
        const i11 = (iy + 1) * rowSize + (ix + 1);
        const h00 = heightMap[i00];
        const h10 = heightMap[i10];
        const h01 = heightMap[i01];
        const h11 = heightMap[i11];
        const u = gridX - ix;
        const v = gridY - iy;
        let h;
        if (u + v < 1) h = h00 + (h10 - h00) * u + (h01 - h00) * v;
        else h = h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
        return h;
    }, [gridSize, segments, heightMap]);

    const getSurfaceNormal = useCallback((x: number, z: number) => {
        const eps = 0.5;
        const hL = getBarycentricHeight(x - eps, z);
        const hR = getBarycentricHeight(x + eps, z);
        const hD = getBarycentricHeight(x, z + eps);
        const hU = getBarycentricHeight(x, z - eps);
        const vX = new THREE.Vector3(2 * eps, hR - hL, 0);
        const vZ = new THREE.Vector3(0, hD - hU, 2 * eps);
        return new THREE.Vector3().crossVectors(vZ, vX).normalize();
    }, [getBarycentricHeight]);

    const uniforms = useMemo(() => ({
        uColorWater: { value: new THREE.Color(planetData.surface.water) },
        uColorSand: { value: new THREE.Color(planetData.surface.sand) },
        uColorGrass: { value: new THREE.Color(planetData.surface.grass) },
        uColorRock: { value: new THREE.Color(planetData.surface.rock) },
        uColorSnow: { value: new THREE.Color(planetData.surface.snow) },
        uColorSky: { value: new THREE.Color(planetData.surface.sky) },
        uSunPos: { value: new THREE.Vector3(0, 1, 0) }, // Dynamic Sun Position
        uTexWater: { value: uTexWater },
        uTexSand: { value: uTexSand },
        uTexGrass: { value: uTexGrass },
        uTexRock: { value: uTexRock },
        uTexSnow: { value: uTexSnow },
    }), [planetData, uTexWater, uTexSand, uTexGrass, uTexRock, uTexSnow]);

    const waterUniforms = useMemo(() => ({
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(planetData.surface.water) },
        uTexture: { value: uTexWater }
    }), [planetData, uTexWater]);

    const moveForward = useRef(false);
    const moveBackward = useRef(false);
    const moveLeft = useRef(false);
    const moveRight = useRef(false);
    const velocityY = useRef(0);
    const isJumping = useRef(false);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW': moveForward.current = true; break;
                case 'KeyS': moveBackward.current = true; break;
                case 'KeyA': moveLeft.current = true; break;
                case 'KeyD': moveRight.current = true; break;
                case 'KeyL': onTakeOff(); break;
                case 'Space':
                    e.preventDefault();
                    if (!isJumping.current) { velocityY.current = 18; isJumping.current = true; }
                    break;
            }
        }
        const onKeyUp = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW': moveForward.current = false; break;
                case 'KeyS': moveBackward.current = false; break;
                case 'KeyA': moveLeft.current = false; break;
                case 'KeyD': moveRight.current = false; break;
            }
        }
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
        }
    }, [onTakeOff]);

    useFrame((state, delta) => {
        // Animate Water
        if (waterMeshRef.current) {
            (waterMeshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.getElapsedTime();
        }

        // Animate Sun (Day/Night Cycle)
        const time = state.clock.getElapsedTime() * 0.05; // Slow day/night
        const radius = 300;
        const sunX = Math.sin(time) * radius;
        const sunY = Math.sin(time + 0.5) * radius; // Offset to keep visible longer
        const sunZ = Math.cos(time) * radius;
        const sunVec = new THREE.Vector3(sunX, Math.max(sunY, -50), sunZ);
        setSunPosition(sunVec);
        uniforms.uSunPos.value.copy(sunVec).normalize();

        // Dynamic Fog Color based on Sun Height
        const sunHeight = sunVec.y;
        const dayColor = new THREE.Color(planetData.surface.sky);
        const sunsetColor = new THREE.Color('#ff7700');
        const nightColor = new THREE.Color('#050510');

        let fogColor = nightColor.clone();
        if (sunHeight > 50) fogColor.lerp(dayColor, 1.0);
        else if (sunHeight > -20) fogColor.lerp(sunsetColor, (sunHeight + 20) / 70);

        if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.color.lerp(fogColor, 0.1);
        }

        if (controlsRef.current && controlsRef.current.isLocked) {
            const steps = 8;
            const dt = delta / steps;
            const camera = state.camera;
            const playerHeight = 4.0;
            const collisionRadius = 1.5;

            for (let i = 0; i < steps; i++) {
                const speed = 18.0 * dt;
                const front = new THREE.Vector3(0, 0, 0);
                const side = new THREE.Vector3(0, 0, 0);
                if (moveForward.current) front.z -= 1;
                if (moveBackward.current) front.z += 1;
                if (moveLeft.current) side.x -= 1;
                if (moveRight.current) side.x += 1;
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                camDir.y = 0; camDir.normalize();
                const camSide = new THREE.Vector3();
                camSide.crossVectors(camDir, camera.up);
                const desiredMove = new THREE.Vector3();
                desiredMove.add(camDir.multiplyScalar(-front.z));
                desiredMove.add(camSide.multiplyScalar(side.x));
                if (desiredMove.length() > 0) {
                    desiredMove.normalize().multiplyScalar(speed);
                    const normal = getSurfaceNormal(playerPos.x, playerPos.z);
                    const slopeDot = normal.dot(new THREE.Vector3(0, 1, 0));
                    if (slopeDot < 0.5) {
                        const projection = desiredMove.clone().projectOnPlane(normal);
                        playerPos.add(projection);
                    } else {
                        playerPos.add(desiredMove);
                    }
                }
                velocityY.current -= 50.0 * dt;
                velocityY.current = Math.max(velocityY.current, -60);
                playerPos.y += velocityY.current * dt;
                const hC = getBarycentricHeight(playerPos.x, playerPos.z);
                const hF = getBarycentricHeight(playerPos.x, playerPos.z + collisionRadius);
                const hB = getBarycentricHeight(playerPos.x, playerPos.z - collisionRadius);
                const hL = getBarycentricHeight(playerPos.x - collisionRadius, playerPos.z);
                const hR = getBarycentricHeight(playerPos.x + collisionRadius, playerPos.z);
                const groundH = Math.max(hC, hF, hB, hL, hR);
                if (playerPos.y < groundH + playerHeight) {
                    playerPos.y = groundH + playerHeight;
                    velocityY.current = 0;
                    isJumping.current = false;
                }
            }

            // THIRD PERSON CAMERA LOGIC
            // 1. Get Camera Direction
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            const yaw = Math.atan2(camDir.x, camDir.z); // Get horizontal angle
            setPlayerRotationY(yaw + Math.PI); // Standard models often face +Z, camera looks -Z, so flip 180?
            // It depends on model. Let's assume standard +Z face for now or tweak.

            // 2. Position Camera behind player based on VIEW direction, not player position directly
            // Actually PointerLockControls rotates the camera. We just need to move it relative to player.
            // We want Camera Pos = Player Pos + Offset(Rotated by Yaw)

            const camOffset = new THREE.Vector3(0, 2.5, 4.0); // Up 2.5, Back 4.0
            camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

            const targetCamPos = playerPos.clone().add(camOffset);

            // Smooth follow
            camera.position.lerp(targetCamPos, 0.2);
        }
    });

    return (
        <group>
            <PointerLockControls ref={controlsRef} />
            <Sky sunPosition={sunPosition} turbidity={5} rayleigh={1} mieCoefficient={0.005} mieDirectionalG={0.8} />
            <Environment preset="sunset" />
            <fogExp2 args={['#000000', 0.0025]} />
            <hemisphereLight color={new THREE.Color(0x87CEEB)} groundColor={new THREE.Color(0x332200)} intensity={sunPosition.y > 0 ? 1.2 : 0.2} />
            <directionalLight position={sunPosition} intensity={sunPosition.y > 0 ? 3.5 : 0} castShadow shadow-bias={-0.0005} shadow-normalBias={0.05} shadow-mapSize={[2048, 2048]} shadow-camera-left={-100} shadow-camera-right={100} shadow-camera-top={100} shadow-camera-bottom={-100} />

            <group position={sunPosition}>
                <mesh>
                    <sphereGeometry args={[15, 32, 32]} />
                    <meshBasicMaterial color="#ffaa00" toneMapped={false} />
                </mesh>
                <sprite scale={[200, 200, 1]}>
                    <spriteMaterial map={sunGlareTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                </sprite>
            </group>

            {sunPosition.y <= 0 && <Stars radius={350} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />}

            <WeatherSystem planetData={planetData} playerPos={playerPos} />

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow castShadow geometry={geometry}>
                <shaderMaterial vertexShader={TERRAIN_VERTEX_SHADER} fragmentShader={TERRAIN_FRAGMENT_SHADER} uniforms={uniforms} />
            </mesh>

            <mesh ref={waterMeshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
                <planeGeometry args={[400, 400, 64, 64]} />
                <shaderMaterial vertexShader={WATER_FLOW_VERTEX_SHADER} fragmentShader={WATER_FLOW_FRAGMENT_SHADER} uniforms={waterUniforms} transparent side={THREE.DoubleSide} />
            </mesh>

            {/* RENDER PLAYER CHARACTER VISIBLE IN TPP */}
            <Human
                position={[playerPos.x, playerPos.y - 4.0, playerPos.z]}
                getHeight={getBarycentricHeight}
                sunPosition={sunPosition}
                isPlayer={true}
                rotationY={playerRotationY}
            />

            <MultiBiomeVegetation count={2000} planetData={planetData} getHeight={getBarycentricHeight} />
            <GrassField count={40000} planetData={planetData} getHeight={getBarycentricHeight} />
            <Village count={50} getHeight={getBarycentricHeight} />
            <Population count={30} getHeight={getBarycentricHeight} sunPosition={sunPosition} />

            <Text position={[0, 20, -20]} fontSize={2} color="white">
                Welcome to {planetData.name}
            </Text>
            <Text position={[0, 18, -20]} fontSize={1} color="#ddd">
                WASD to Walk | SPACE to Jump | L to Take Off | LEFT CLICK to Attack
            </Text>
        </group>
    )
}

// --- MISSILE RENDERER ---
const MissileRenderer: React.FC<{ position: THREE.Vector3, quaternion: THREE.Quaternion }> = ({ position, quaternion }) => {
    return (
        <group position={position} quaternion={quaternion}>
            <Trail width={1.5} length={8} color="#ff4400" attenuation={(t) => t * t}>
                <group rotation={[Math.PI / 2, 0, 0]}>
                    <mesh>
                        <cylinderGeometry args={[0.15, 0.15, 1.5, 8]} />
                        <meshStandardMaterial color="#444" roughness={0.4} metalness={0.8} />
                    </mesh>
                    <mesh position={[0, 0.95, 0]}>
                        <coneGeometry args={[0.15, 0.4, 16]} />
                        <meshStandardMaterial color="#aa0000" roughness={0.2} />
                    </mesh>
                </group>
            </Trail>
            <pointLight color="#ff5500" distance={8} decay={2} intensity={5} position={[0, 0, 0.8]} />
        </group>
    );
};

const Explosion: React.FC<{ position: THREE.Vector3, onComplete: () => void, scale?: number }> = ({ position, onComplete, scale = 1.0 }) => {
    const meshRef = useRef<THREE.Points>(null);
    const [progress, setProgress] = useState(0);
    const geometry = useMemo(() => {
        const count = 800;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const randoms = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 1.0;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            randoms[i] = Math.random();
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
        return geo;
    }, []);

    useFrame((state, delta) => {
        if (progress >= 1.0) { onComplete(); return; }
        setProgress(prev => prev + delta * 1.5);
        if (meshRef.current) (meshRef.current.material as THREE.ShaderMaterial).uniforms.uProgress.value = progress;
    });
    if (progress >= 1.0) return null;
    return (
        <points ref={meshRef} position={position} geometry={geometry} scale={[scale, scale, scale]}>
            <shaderMaterial
                vertexShader={EXPLOSION_VERTEX_SHADER} fragmentShader={EXPLOSION_FRAGMENT_SHADER}
                uniforms={{ uProgress: { value: 0 } }} transparent blending={THREE.AdditiveBlending} depthWrite={false}
            />
        </points>
    );
};

const DebrisField: React.FC<{ position: THREE.Vector3, color: string, size: number }> = ({ position, color, size }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const count = 60;
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const positions = useMemo(() => Array.from({ length: count }, () => new THREE.Vector3((Math.random() - 0.5) * size, (Math.random() - 0.5) * size, (Math.random() - 0.5) * size)), [size]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        for (let i = 0; i < count; i++) {
            positions[i].add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(delta * 5));
            dummy.position.copy(positions[i]);
            dummy.rotation.x += delta;
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });
    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} position={position}>
            <dodecahedronGeometry args={[size * 0.15, 0]} />
            <meshStandardMaterial color={new THREE.Color(color).multiplyScalar(0.5)} roughness={0.8} />
        </instancedMesh>
    );
};

const LingeringDust: React.FC<{ position: THREE.Vector3, color: string, size: number }> = ({ position, color, size }) => {
    const ref = useRef<THREE.Points>(null);
    const [expansion, setExpansion] = useState(0);
    const geometry = useMemo(() => {
        const count = 300;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const directions = new Float32Array(count * 3);
        const randoms = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * size; positions[i * 3 + 1] = (Math.random() - 0.5) * size; positions[i * 3 + 2] = (Math.random() - 0.5) * size;
            directions[i * 3] = positions[i * 3]; directions[i * 3 + 1] = positions[i * 3 + 1]; directions[i * 3 + 2] = positions[i * 3 + 2];
            randoms[i] = Math.random();
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
        geo.setAttribute('aDirection', new THREE.BufferAttribute(directions, 3));
        return geo;
    }, [size]);
    useFrame((state, delta) => {
        setExpansion(prev => prev + delta * 0.5);
        if (ref.current) (ref.current.material as THREE.ShaderMaterial).uniforms.uExpansion.value = expansion;
    });
    return (
        <points ref={ref} position={position} geometry={geometry}>
            <shaderMaterial vertexShader={DUST_VERTEX_SHADER} fragmentShader={DUST_FRAGMENT_SHADER} uniforms={{ uColor: { value: new THREE.Color(color) }, uExpansion: { value: 0 } }} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
    );
};

const Planet: React.FC<{
    data: typeof PLANETS[0];
    baseDistance: number;
    health: number;
    maxHealth: number;
    isDestroyed: boolean;
    onUpdatePosition: (name: string, pos: THREE.Vector3) => void;
}> = ({ data, baseDistance, health, maxHealth, isDestroyed, onUpdatePosition }) => {
    const ref = useRef<THREE.Mesh>(null);
    const [texture, setTexture] = useState<THREE.Texture | null>(null);
    const [justExploded, setJustExploded] = useState(false);
    const [lastPosition] = useState(new THREE.Vector3());

    const atmosphereUniforms = useMemo(() => ({
        uColor: { value: new THREE.Color(data.surface.sky) }
    }), [data.surface.sky]);

    useEffect(() => {
        const loader = new THREE.TextureLoader();
        loader.load(data.texture, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; setTexture(tex); }, undefined, () => console.warn(`Failed texture`));
    }, [data.texture]);

    const radius = baseDistance + data.distanceOffset;

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        const angle = t * data.speed * 0.1;
        if (ref.current && !isDestroyed) {
            ref.current.position.x = Math.cos(angle) * radius;
            ref.current.position.z = Math.sin(angle) * radius;
            ref.current.rotation.y += 0.01;
            ref.current.updateMatrixWorld();
            lastPosition.copy(ref.current.position);
            onUpdatePosition(data.name, ref.current.position);
        } else if (isDestroyed && !justExploded) {
            setJustExploded(true);
        }
    });

    if (justExploded || isDestroyed) {
        return (
            <group>
                {justExploded && <Explosion position={lastPosition} scale={data.size * 3} onComplete={() => setJustExploded(false)} />}
                <DebrisField position={lastPosition} color={data.color} size={data.size} />
                <LingeringDust position={lastPosition} color={data.color} size={data.size} />
            </group>
        )
    }

    const healthPercent = health / maxHealth;
    const barColor = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.2 ? '#ffff00' : '#ff0000';

    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[radius - 0.05, radius + 0.05, 128]} /><meshBasicMaterial color="#ffffff" opacity={0.05} transparent side={THREE.DoubleSide} /></mesh>
            {health < maxHealth && ref.current && (
                <Billboard position={[ref.current.position.x, ref.current.position.y + data.size * 2.5, ref.current.position.z]}>
                    <mesh position={[-2 + (healthPercent * 4) / 2, 0, 0.01]}><planeGeometry args={[healthPercent * 4, 0.2]} /><meshBasicMaterial color={barColor} /></mesh>
                </Billboard>
            )}
            <group ref={ref} name={`PLANET_${data.name}`}>
                <mesh>
                    <sphereGeometry args={[data.size, 64, 64]} />
                    <meshStandardMaterial map={texture} color={texture ? '#ffffff' : data.color} roughness={0.7} metalness={0.1} />
                </mesh>
                <mesh scale={[1.2, 1.2, 1.2]}>
                    <sphereGeometry args={[data.size, 64, 64]} />
                    <shaderMaterial
                        vertexShader={PLANET_ATMOSPHERE_VERTEX_SHADER}
                        fragmentShader={PLANET_ATMOSPHERE_FRAGMENT_SHADER}
                        uniforms={atmosphereUniforms}
                        blending={THREE.AdditiveBlending}
                        side={THREE.FrontSide}
                        transparent
                        depthWrite={false}
                    />
                </mesh>
            </group>
            {data.hasRing && ref.current && (
                <mesh position={ref.current.position}>
                    <ringGeometry args={[data.size * 1.4, data.size * 2.2, 64]} />
                    <meshStandardMaterial color="#C0A080" opacity={0.8} transparent side={THREE.DoubleSide} />
                </mesh>
            )}
        </group>
    );
};

const Exoplanet: React.FC<{ data: typeof EXOPLANETS[0] }> = ({ data }) => {
    const ref = useRef<THREE.Mesh>(null);
    const atmosphereUniforms = useMemo(() => ({
        uColor: { value: new THREE.Color(data.surface.sky) }
    }), [data.surface.sky]);
    useFrame(() => { if (ref.current) ref.current.rotation.y += 0.005; });
    return (
        <group position={new THREE.Vector3(data.position[0], data.position[1], data.position[2])}>
            <pointLight intensity={1} distance={50} color={data.color} />
            <group ref={ref} name={`PLANET_${data.name}`}>
                <mesh>
                    <sphereGeometry args={[data.size, 32, 32]} />
                    <meshStandardMaterial color={data.color} roughness={0.6} metalness={0.4} />
                </mesh>
                <mesh scale={[1.2, 1.2, 1.2]}>
                    <sphereGeometry args={[data.size, 32, 32]} />
                    <shaderMaterial
                        vertexShader={PLANET_ATMOSPHERE_VERTEX_SHADER}
                        fragmentShader={PLANET_ATMOSPHERE_FRAGMENT_SHADER}
                        uniforms={atmosphereUniforms}
                        blending={THREE.AdditiveBlending}
                        side={THREE.FrontSide}
                        transparent
                        depthWrite={false}
                    />
                </mesh>
            </group>
        </group>
    )
}

const GravityGrid: React.FC<{ baseDistance: number }> = ({ baseDistance }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uPlanetDistances: { value: PLANETS.map(p => baseDistance + p.distanceOffset) },
        uPlanetSpeeds: { value: PLANETS.map(p => p.speed) },
        uPlanetSizes: { value: PLANETS.map(p => p.size) }
    }), [baseDistance]);
    useFrame((state) => { if (meshRef.current) (meshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.getElapsedTime(); });
    return (
        <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
            <planeGeometry args={[150, 150, 128, 128]} />
            <shaderMaterial vertexShader={GRID_VERTEX_SHADER} fragmentShader={GRID_FRAGMENT_SHADER} uniforms={uniforms} transparent side={THREE.DoubleSide} wireframe={true} />
        </mesh>
    );
};

const SolarSystem: React.FC<{ mass: number; destroyedPlanets: string[]; planetHealth: { [key: string]: number }; onUpdatePlanetPos: (name: string, pos: THREE.Vector3) => void; }> = ({ mass, destroyedPlanets, planetHealth, onUpdatePlanetPos }) => {
    const bhRadius = Math.sqrt(mass) * 0.5;
    const safeZone = bhRadius * 10 + 10;
    return (
        <group>
            {PLANETS.map((planet) => (
                <Planet key={planet.name} data={planet} baseDistance={safeZone} health={planetHealth[planet.name] ?? 1000} maxHealth={1000} isDestroyed={destroyedPlanets.includes(planet.name)} onUpdatePosition={onUpdatePlanetPos} />
            ))}
            <GravityGrid baseDistance={safeZone} key={safeZone} />
        </group>
    );
};

const Galaxy: React.FC<{ data: typeof GALAXIES[0] }> = ({ data }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const uniforms = useMemo(() => ({ uTime: { value: 0 }, uColor: { value: new THREE.Vector3(data.color[0], data.color[1], data.color[2]) }, uArms: { value: data.arms }, uTwist: { value: data.twist } }), [data]);
    useFrame((state) => { if (meshRef.current) { meshRef.current.rotation.z += 0.001; (meshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.getElapsedTime(); meshRef.current.lookAt(state.camera.position); } });
    return (
        <mesh ref={meshRef} position={new THREE.Vector3(data.position[0], data.position[1], data.position[2])} scale={[data.size, data.size, 1]}>
            <planeGeometry args={[1, 1, 64, 64]} />
            <shaderMaterial vertexShader={GALAXY_VERTEX_SHADER} fragmentShader={GALAXY_FRAGMENT_SHADER} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
    );
}

const Nebula: React.FC<{ data: typeof NEBULAE[0] }> = ({ data }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const uniforms = useMemo(() => ({ uTime: { value: 0 }, uColor1: { value: new THREE.Vector3(data.color1[0], data.color1[1], data.color1[2]) }, uColor2: { value: new THREE.Vector3(data.color2[0], data.color2[1], data.color2[2]) }, uDensity: { value: 0.6 } }), [data]);
    useFrame((state) => { if (meshRef.current) (meshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.getElapsedTime(); })
    return (
        <Billboard position={new THREE.Vector3(data.position[0], data.position[1], data.position[2])} scale={[data.size, data.size, 1]}>
            <planeGeometry args={[1, 1, 32, 32]} />
            <shaderMaterial vertexShader={NEBULA_VERTEX_SHADER} fragmentShader={NEBULA_FRAGMENT_SHADER} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </Billboard>
    )
}

const GalacticSystem: React.FC = () => {
    return (
        <group>
            {GALAXIES.map((galaxy) => <Galaxy key={galaxy.name} data={galaxy} />)}
            {NEBULAE.map((nebula) => <Nebula key={nebula.name} data={nebula} />)}
            {EXOPLANETS.map((exo) => <Exoplanet key={exo.name} data={exo} />)}
        </group>
    );
}

const GammaRay: React.FC<{ length: number }> = ({ length }) => {
    const beamRef = useRef<THREE.Mesh>(null);
    const particlesRef = useRef<THREE.Points>(null);
    const particleCount = 60;
    const particles = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const speeds = new Float32Array(particleCount);
        const randoms = new Float32Array(particleCount);
        for (let i = 0; i < particleCount; i++) { positions[i * 3] = (Math.random() - 0.5) * 0.5; positions[i * 3 + 1] = (Math.random() - 0.5) * 0.5; positions[i * 3 + 2] = 0; speeds[i] = 2.0 + Math.random() * 2.0; randoms[i] = Math.random(); }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
        geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
        return geo;
    }, []);
    const particleUniforms = useMemo(() => ({ uTime: { value: 0 }, uSpeed: { value: 1.0 }, uLength: { value: length } }), [length]);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (beamRef.current) { (beamRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = t; (beamRef.current.material as THREE.ShaderMaterial).uniforms.uLength.value = length; }
        if (particlesRef.current) { (particlesRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = t; (particlesRef.current.material as THREE.ShaderMaterial).uniforms.uLength.value = length; }
    });
    return (
        <group>
            <mesh ref={beamRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -length / 2]}>
                <cylinderGeometry args={[0.4, 1.2, length, 16, 1, true]} />
                <shaderMaterial vertexShader={LASER_VERTEX_SHADER} fragmentShader={LASER_FRAGMENT_SHADER} uniforms={{ uTime: { value: 0 }, uLength: { value: length }, uColor: { value: new THREE.Vector3(0.8, 0.2, 1.0) } }} transparent blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <points ref={particlesRef} geometry={particles}>
                <shaderMaterial vertexShader={ENERGY_PARTICLE_VERTEX_SHADER} fragmentShader={ENERGY_PARTICLE_FRAGMENT_SHADER} uniforms={particleUniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
            </points>
        </group>
    )
}

const DetailedShipModel: React.FC<{ thrust: number }> = ({ thrust }) => {
    const glowRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(() => {
        const col = new THREE.Color();
        if (thrust < 0.5) col.setHSL(0.6, 1.0, 0.5 + thrust);
        else col.setHSL(0.1, 1.0, 0.5 + (thrust - 0.5));
        if (glowRef.current) glowRef.current.color = col;
    });
    return (
        <group rotation={[0, Math.PI, 0]}>
            <mesh position={[0, 0, 0.5]}><boxGeometry args={[0.8, 0.6, 3]} /><meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} /></mesh>
            <mesh position={[0, 0, 2.2]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.4, 1.5, 4]} /><meshStandardMaterial color="#333" roughness={0.3} metalness={0.8} /></mesh>
            <mesh position={[0, 0.4, 1.0]} rotation={[Math.PI / 6, 0, 0]}><boxGeometry args={[0.6, 0.3, 1.2]} /><meshPhysicalMaterial color="#00aaff" roughness={0.1} metalness={0.9} transmission={0.5} thickness={1} emissive="#0044aa" emissiveIntensity={0.5} /></mesh>
            <group position={[0, 0, -1.2]}>
                <mesh position={[-0.6, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.3, 0.4, 1.5, 16]} /><meshStandardMaterial color="#222" roughness={0.3} metalness={0.9} /></mesh>
                <mesh position={[-0.6, 0, -0.8]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[0, 0.25, 16]} /><meshBasicMaterial ref={glowRef} color="#00aaff" /><pointLight color="#00aaff" distance={5} intensity={2} /></mesh>
                <mesh position={[0.6, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.3, 0.4, 1.5, 16]} /><meshStandardMaterial color="#222" roughness={0.3} metalness={0.9} /></mesh>
                <mesh position={[0.6, 0, -0.8]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[0, 0.25, 16]} /><meshBasicMaterial color="#00aaff" /><pointLight color="#00aaff" distance={5} intensity={2} /></mesh>
            </group>
        </group>
    )
}

const Spaceship = React.forwardRef<THREE.Group, {
    destination: string | null;
    mass: number;
    pilotMode: boolean;
    onDamagePlanet: (name: string, amount: number) => void;
    onFireMissile: (position: THREE.Vector3, velocity: THREE.Vector3, targetName: string | null) => void;
    onLand: (planetName: string) => void;
}>(({ destination, mass, pilotMode, onDamagePlanet, onFireMissile, onLand }, ref) => {
    const localRef = useRef<THREE.Group>(null);
    const modelGroupRef = useRef<THREE.Group>(null);
    const targetPosition = useRef(new THREE.Vector3());
    const currentSpeed = useRef(0);
    const keys = useRef<{ [key: string]: boolean }>({});
    const mouseDelta = useRef(new THREE.Vector2(0, 0));
    const { scene } = useThree();

    const [isFiring, setIsFiring] = useState(false);
    const [laserLength, setLaserLength] = useState(100);
    const [thrustRatio, setThrustRatio] = useState(0);
    const [nearPlanet, setNearPlanet] = useState<string | null>(null);
    const raycaster = useRef(new THREE.Raycaster());
    const lastMissileTime = useRef(0);

    useImperativeHandle(ref, () => localRef.current as THREE.Group);
    const bhRadius = Math.sqrt(mass) * 0.5;
    const safeZone = bhRadius * 10 + 10;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
        const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
        const handleMouseMove = (e: MouseEvent) => {
            if (document.pointerLockElement === document.querySelector('canvas')) {
                mouseDelta.current.x += e.movementX;
                mouseDelta.current.y += e.movementY;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        document.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    useFrame((state, delta) => {
        if (!localRef.current) return;

        if (pilotMode) {
            const turnSpeed = 0.0015;
            localRef.current.rotateX(-mouseDelta.current.y * turnSpeed);
            localRef.current.rotateY(-mouseDelta.current.x * turnSpeed);
            const bankAngle = THREE.MathUtils.clamp(-mouseDelta.current.x * 0.05, -0.8, 0.8);
            if (modelGroupRef.current) modelGroupRef.current.rotation.z = THREE.MathUtils.lerp(modelGroupRef.current.rotation.z, bankAngle, 0.1);
            mouseDelta.current.set(0, 0);
            const rollSpeed = 2.0 * delta;

            if (keys.current['KeyD']) localRef.current.rotateZ(-rollSpeed);
            if (keys.current['KeyA']) localRef.current.rotateZ(rollSpeed);

            const acceleration = 60 * delta;
            const friction = 20 * delta;
            const maxSpeed = 100;
            if (keys.current['KeyW']) currentSpeed.current = Math.min(currentSpeed.current + acceleration, maxSpeed);
            else if (keys.current['KeyS']) currentSpeed.current = Math.max(currentSpeed.current - acceleration, -maxSpeed / 2);
            else {
                if (currentSpeed.current > 0) currentSpeed.current = Math.max(currentSpeed.current - friction, 0);
                if (currentSpeed.current < 0) currentSpeed.current = Math.min(currentSpeed.current + friction, 0);
            }
            localRef.current.translateZ(-currentSpeed.current * delta);
            setThrustRatio(Math.abs(currentSpeed.current) / maxSpeed);

            let foundPlanet: string | null = null;
            const shipPos = localRef.current.position;

            PLANETS.forEach(p => {
                const pObj = scene.getObjectByName(`PLANET_${p.name}`);
                if (pObj && pObj.position.distanceTo(shipPos) < p.size + 5) {
                    foundPlanet = p.name;
                }
            });
            if (!foundPlanet) {
                EXOPLANETS.forEach(p => {
                    const pObj = scene.getObjectByName(`PLANET_${p.name}`);
                    if (pObj && pObj.position.distanceTo(shipPos) < p.size + 5) {
                        foundPlanet = p.name;
                    }
                });
            }

            setNearPlanet(foundPlanet);
            if (foundPlanet && keys.current['KeyL']) {
                onLand(foundPlanet);
            }

            if (keys.current['KeyE']) {
                setIsFiring(true);
                const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(localRef.current.quaternion);
                raycaster.current.set(localRef.current.position, direction);
                const intersects = raycaster.current.intersectObjects(scene.children, true);
                let hitDist = 200;
                for (const intersect of intersects) {
                    if (intersect.distance < 3) continue;
                    if (intersect.object.name && intersect.object.name.startsWith("PLANET_")) {
                        hitDist = intersect.distance;
                        onDamagePlanet(intersect.object.name.replace("PLANET_", ""), 5);
                        break;
                    }
                }
                setLaserLength(hitDist);
            } else {
                setIsFiring(false);
            }

            if (keys.current['KeyR']) {
                const now = state.clock.elapsedTime;
                if (now - lastMissileTime.current > 0.5) {
                    lastMissileTime.current = now;
                    let closestTarget: string | null = null;
                    let minAngle = Math.PI / 3;
                    const shipPos = localRef.current.position;
                    const shipDir = new THREE.Vector3(0, 0, -1).applyQuaternion(localRef.current.quaternion).normalize();
                    PLANETS.forEach(p => {
                        const pObj = scene.getObjectByName(`PLANET_${p.name}`);
                        if (pObj) {
                            const toP = new THREE.Vector3().subVectors(pObj.position, shipPos).normalize();
                            const angle = shipDir.angleTo(toP);
                            if (angle < minAngle) { minAngle = angle; closestTarget = p.name; }
                        }
                    });
                    const spawnPos = localRef.current.position.clone().add(new THREE.Vector3(0, -0.5, 0).applyQuaternion(localRef.current.quaternion));
                    const forward = new THREE.Vector3(0, 0, -40).applyQuaternion(localRef.current.quaternion);
                    onFireMissile(spawnPos, forward, closestTarget);
                }
            }
            return;
        }

        if (modelGroupRef.current) modelGroupRef.current.rotation.z = 0;
        setThrustRatio(0.3);
        let targetVec = new THREE.Vector3();
        let isLongDistance = false;
        let targetPlanet = PLANETS.find(p => p.name === destination);
        let targetGalaxy = GALAXIES.find(g => g.name === destination);
        let targetNebula = NEBULAE.find(n => n.name === destination);
        let targetExo = EXOPLANETS.find(e => e.name === destination);

        if (targetPlanet) {
            const t = state.clock.getElapsedTime();
            const angle = t * targetPlanet.speed * 0.1;
            const r = safeZone + targetPlanet.distanceOffset;
            targetVec.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
            const directionFromCenter = targetVec.clone().normalize();
            targetPosition.current.copy(targetVec.clone().add(directionFromCenter.multiplyScalar(targetPlanet.size * 2 + 1)));
        } else if (targetGalaxy) {
            targetVec.set(targetGalaxy.position[0], targetGalaxy.position[1], targetGalaxy.position[2]);
            targetPosition.current.copy(targetVec.clone().multiplyScalar(0.9));
            isLongDistance = true;
        } else if (targetNebula) {
            targetVec.set(targetNebula.position[0], targetNebula.position[1], targetNebula.position[2]);
            targetPosition.current.copy(targetVec.clone().multiplyScalar(0.8));
            isLongDistance = true;
        } else if (targetExo) {
            targetVec.set(targetExo.position[0], targetExo.position[1], targetExo.position[2]);
            targetPosition.current.copy(targetVec.clone().add(new THREE.Vector3(0, 2, 5)));
            isLongDistance = true;
        } else {
            localRef.current.rotation.y += 0.005;
            return;
        }

        const dist = localRef.current.position.distanceTo(targetPosition.current);
        const lerpSpeed = isLongDistance ? 0.05 : 0.03;
        localRef.current.position.lerp(targetPosition.current, lerpSpeed);
        if (dist > 0.5) localRef.current.lookAt(targetPosition.current);
    });

    return (
        <group ref={localRef} position={[30, 0, 0]}>
            {nearPlanet && (
                <Html position={[0, 2, 0]} center>
                    <div className="text-cyan-300 font-bold bg-black/80 p-2 rounded border border-cyan-500 text-center">
                        <div>LANDING AVAILABLE</div>
                        <div className="text-xs text-white animate-pulse">PRESS 'L'</div>
                    </div>
                </Html>
            )}
            <group position={[0, 0, 2]}>
                <Trail width={2} length={15} color="#00ffff" attenuation={(t) => t * t}>
                    <mesh visible={false}><boxGeometry args={[0.1, 0.1, 0.1]} /></mesh>
                </Trail>
            </group>
            <group ref={modelGroupRef}><DetailedShipModel thrust={thrustRatio} /></group>
            {isFiring && <GammaRay length={laserLength} />}
        </group>
    );
});

const Jets: React.FC<{ params: BlackHoleParams; color: THREE.Vector3 }> = ({ params, color }) => {
    const pointsRef = useRef<THREE.Points>(null);
    const count = 2000;
    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const randoms = new Float32Array(count);
        const offsets = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = 0; positions[i * 3 + 1] = Math.random() > 0.5 ? 1 : -1; positions[i * 3 + 2] = 0;
            randoms[i] = Math.random(); offsets[i] = Math.random() * 100.0;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
        geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
        return geo;
    }, []);
    const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSpeed: { value: params.spin }, uColor: { value: color } }), [color, params.spin]);
    useFrame((state) => { if (pointsRef.current) (pointsRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime; });
    if (params.spin < 0.1) return null;
    return (
        <points ref={pointsRef} geometry={geometry}>
            <shaderMaterial vertexShader={JET_VERTEX_SHADER} fragmentShader={JET_FRAGMENT_SHADER} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
    );
}

const BlackHole: React.FC<{ params: BlackHoleParams }> = ({ params }) => {
    const diskRef = useRef<THREE.Mesh>(null);
    const photonRingRef = useRef<THREE.Mesh>(null);
    const radius = Math.sqrt(params.mass) * 0.5;
    const diskColor = useMemo(() => {
        const t = params.temperature;
        if (t < 2000) return new THREE.Vector3(1.0, 0.1, 0.05);
        if (t < 4000) return new THREE.Vector3(1.0, 0.4, 0.1);
        if (t < 7000) return new THREE.Vector3(1.0, 0.9, 0.7);
        if (t < 12000) return new THREE.Vector3(0.8, 0.9, 1.0);
        return new THREE.Vector3(0.4, 0.6, 1.0);
    }, [params.temperature]);
    useFrame((state) => {
        const time = state.clock.elapsedTime;
        if (diskRef.current) (diskRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
        if (photonRingRef.current) { photonRingRef.current.lookAt(state.camera.position); (photonRingRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = time; }
    });
    return (
        <group>
            <mesh scale={[radius, radius, radius]}><sphereGeometry args={[1, 64, 64]} /><meshBasicMaterial color="#000000" /></mesh>
            <mesh ref={photonRingRef} scale={[radius * 2.2, radius * 2.2, 1]}>
                <ringGeometry args={[0.48, 0.52, 128]} />
                <shaderMaterial vertexShader={DISK_VERTEX_SHADER} fragmentShader={PHOTON_RING_FRAGMENT_SHADER} uniforms={{ uColor: { value: new THREE.Vector3(1.0, 0.9, 0.8) }, uTime: { value: 0 } }} transparent blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={diskRef} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[radius * 1.2, radius * 6.0, 256, 32]} />
                <shaderMaterial vertexShader={DISK_VERTEX_SHADER} fragmentShader={DISK_FRAGMENT_SHADER} uniforms={{ uTime: { value: 0 }, uColor: { value: diskColor }, uSpeed: { value: params.spin * 2.5 + 0.2 }, uDensity: { value: params.accretionDensity } }} transparent side={THREE.DoubleSide} depthWrite={false} blending={THREE.NormalBlending} />
            </mesh>
            <Jets params={params} color={diskColor} />
        </group>
    );
};

const CameraFollower: React.FC<{ shipRef: React.RefObject<THREE.Group>; controlsRef: React.RefObject<any>; destination: string | null; pilotMode: boolean; isLanded: boolean }> = ({ shipRef, controlsRef, destination, pilotMode, isLanded }) => {
    const { camera } = useThree();
    const offset = new THREE.Vector3();
    useFrame(() => {
        if (isLanded) return;
        if (!shipRef.current || !controlsRef.current) return;
        const ship = shipRef.current;
        const controls = controlsRef.current;
        if (pilotMode) {
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.quaternion);
            const camPos = ship.position.clone().add(dir.clone().multiplyScalar(-15)).add(up.clone().multiplyScalar(5));
            camera.position.lerp(camPos, 0.2);
            camera.lookAt(ship.position.clone().add(dir.multiplyScalar(20)));
            return;
        }
        controls.target.lerp(ship.position, 0.1);
        if (destination) {
            const dir = new THREE.Vector3(); ship.getWorldDirection(dir);
            offset.copy(dir).multiplyScalar(-20).add(new THREE.Vector3(0, 8, 0));
            camera.position.lerp(ship.position.clone().add(offset), 0.05);
        }
        controls.update();
    });
    return null;
};

// MAIN SCENE
export default function Scene({ params, destination, pilotMode, destroyedPlanets, onDestroyPlanet }: SceneProps) {
    const shipRef = useRef<THREE.Group>(null);
    const controlsRef = useRef<any>(null);
    const [planetHealth, setPlanetHealth] = useState<{ [key: string]: number }>({});
    const [landedPlanet, setLandedPlanet] = useState<string | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const planetPositionsRef = useRef<{ [key: string]: { x: number, y: number, z: number, size: number } }>({});

    const [missiles, setMissiles] = useState<{ id: number, position: THREE.Vector3, quaternion: THREE.Quaternion }[]>([]);
    const missilesDataRef = useRef<{ id: number, position: { x: number, y: number, z: number }, velocity: { x: number, y: number, z: number }, quaternion: { x: number, y: number, z: number, w: number }, targetName: string | null, lifeTime: number }[]>([]);
    const missileIdCounter = useRef(0);
    const [impacts, setImpacts] = useState<{ id: number, position: THREE.Vector3 }[]>([]);

    useEffect(() => {
        workerRef.current = createWorker(physicsWorkerCode);
        workerRef.current.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'MISSILES_UPDATED') {
                const { missiles: updatedMissilesData, hits } = payload;
                missilesDataRef.current = updatedMissilesData;
                setMissiles(updatedMissilesData.map((m: any) => ({
                    id: m.id,
                    position: new THREE.Vector3(m.position.x, m.position.y, m.position.z),
                    quaternion: new THREE.Quaternion(m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w)
                })));
                hits.forEach((hit: any) => {
                    const pos = new THREE.Vector3(hit.position.x, hit.position.y, hit.position.z);
                    setImpacts(prev => [...prev, { id: Math.random(), position: pos }]);
                    handleDamage(hit.target, 200);
                });
            }
        };
        return () => workerRef.current?.terminate();
    }, []);

    const handleDamage = useCallback((name: string, amount: number) => {
        if (destroyedPlanets.includes(name)) return;
        setPlanetHealth(prev => {
            const current = prev[name] ?? 1000;
            const next = Math.max(0, current - amount);
            if (next <= 0) onDestroyPlanet(name);
            return { ...prev, [name]: next };
        });
    }, [destroyedPlanets, onDestroyPlanet]);

    const handleFireMissile = (pos: THREE.Vector3, vel: THREE.Vector3, target: string | null) => {
        const id = missileIdCounter.current++;
        const mData = { id, position: { x: pos.x, y: pos.y, z: pos.z }, velocity: { x: vel.x, y: vel.y, z: vel.z }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, targetName: target, lifeTime: 0 };
        missilesDataRef.current.push(mData);
    };

    const handleUpdatePlanetPos = useCallback((name: string, pos: THREE.Vector3) => {
        const size = PLANETS.find(p => p.name === name)?.size || 1;
        planetPositionsRef.current[name] = { x: pos.x, y: pos.y, z: pos.z, size };
    }, []);

    const handleLand = (planetName: string) => {
        setLandedPlanet(planetName);
    };

    const handleTakeOff = () => {
        setLandedPlanet(null);
        if (shipRef.current) {
            const pObj = planetPositionsRef.current[landedPlanet!];
            if (pObj) {
                shipRef.current.position.set(pObj.x, pObj.y + 5, pObj.z + 5);
                shipRef.current.lookAt(0, 0, 0);
            }
        }
    };

    const currentPlanetData = PLANETS.find(p => p.name === landedPlanet) || EXOPLANETS.find(p => p.name === landedPlanet);

    return (
        <Canvas
            camera={{ position: [0, 20, 60], fov: 45 }}
            gl={{ antialias: true, toneMapping: THREE.ReinhardToneMapping, toneMappingExposure: 1.5 }}
            shadows
        >
            {!landedPlanet && (
                <>
                    <PhysicsUpdater workerRef={workerRef} planetPositionsRef={planetPositionsRef} missilesDataRef={missilesDataRef} />
                    <color attach="background" args={['#000005']} />
                    <Stars radius={10000} depth={200} count={50000} factor={8} saturation={0.8} fade speed={0.2} />
                    <ambientLight intensity={0.1} />
                    <pointLight position={[0, 0, 0]} intensity={2.0} distance={500} decay={2} color="#aaf" />
                    <BlackHole params={params} />
                    <React.Suspense fallback={null}>
                        <SolarSystem mass={params.mass} destroyedPlanets={destroyedPlanets} planetHealth={planetHealth} onUpdatePlanetPos={handleUpdatePlanetPos} />
                    </React.Suspense>
                    <GalacticSystem />
                    {missiles.map(m => <MissileRenderer key={m.id} position={m.position} quaternion={m.quaternion} />)}
                    {impacts.map(i => <Explosion key={i.id} position={i.position} scale={2} onComplete={() => setImpacts(prev => prev.filter(x => x.id !== i.id))} />)}

                    <Spaceship
                        ref={shipRef} destination={destination} mass={params.mass} pilotMode={pilotMode}
                        onDamagePlanet={handleDamage} onFireMissile={handleFireMissile} onLand={handleLand}
                    />
                    <CameraFollower shipRef={shipRef} controlsRef={controlsRef} destination={destination} pilotMode={pilotMode} isLanded={false} />
                    <OrbitControls ref={controlsRef} enabled={!pilotMode} enablePan={true} minDistance={5} maxDistance={5000} dampingFactor={0.05} />
                </>
            )}

            {landedPlanet && currentPlanetData && (
                <SurfaceWorld planetData={currentPlanetData} onTakeOff={handleTakeOff} />
            )}
        </Canvas>
    );
};
