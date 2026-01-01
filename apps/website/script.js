/**
 * LunarView Landing Page - JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize particles
    initParticles();

    // Initialize live stats animation
    initLiveStats();

    // Fetch latest version from GitHub
    fetchLatestVersion();

    // Mobile Menu Toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const navActions = document.querySelector('.nav-actions');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks?.classList.toggle('active');
            navActions?.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });
    }

    // Smooth Scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const navHeight = document.querySelector('.navbar')?.offsetHeight || 0;
                const targetPosition = target.offsetTop - navHeight - 20;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            navbar?.classList.add('scrolled');
        } else {
            navbar?.classList.remove('scrolled');
        }
    });

    // FAQ accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        item.addEventListener('toggle', () => {
            if (item.open) {
                faqItems.forEach(other => {
                    if (other !== item && other.open) {
                        other.open = false;
                    }
                });
            }
        });
    });

    // Scroll animation
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card, .pricing-card, .download-card, .step').forEach(el => {
        el.classList.add('animate-ready');
        observer.observe(el);
    });

    console.log('LunarView Landing Page loaded');
});

// Particle System
function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    resize();
    window.addEventListener('resize', resize);

    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = (Math.random() - 0.5) * 0.5;
            this.opacity = Math.random() * 0.5 + 0.1;
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            if (this.x < 0 || this.x > canvas.width ||
                this.y < 0 || this.y > canvas.height) {
                this.reset();
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(139, 92, 246, ${this.opacity})`;
            ctx.fill();
        }
    }

    // Create particles
    for (let i = 0; i < 80; i++) {
        particles.push(new Particle());
    }

    // Draw connections
    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(139, 92, 246, ${0.1 * (1 - distance / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });

        drawConnections();
        requestAnimationFrame(animate);
    }

    animate();
}

// Live Stats Animation
function initLiveStats() {
    const latencyEl = document.getElementById('latency-value');
    const fpsEl = document.getElementById('fps-value');

    if (latencyEl) {
        setInterval(() => {
            const newLatency = Math.floor(Math.random() * 5) + 6; // 6-10ms
            latencyEl.textContent = newLatency;
        }, 2000);
    }

    if (fpsEl) {
        setInterval(() => {
            const newFps = Math.random() > 0.9 ? 59 : 60;
            fpsEl.textContent = newFps;
        }, 1500);
    }
}

// Dynamic styles
const style = document.createElement('style');
style.textContent = `
    .animate-ready {
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.6s ease, transform 0.6s ease;
    }
    
    .animate-in {
        opacity: 1;
        transform: translateY(0);
    }
    
    .navbar.scrolled {
        padding: 12px 0;
        background: rgba(10, 10, 15, 0.95);
    }
    
    @media (max-width: 768px) {
        .nav-links.active,
        .nav-actions.active {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--bg-secondary);
            padding: 20px;
            border-bottom: 1px solid var(--border-default);
            gap: 16px;
        }
        
        .mobile-menu-btn.active span:nth-child(1) {
            transform: rotate(45deg) translate(5px, 5px);
        }
        
        .mobile-menu-btn.active span:nth-child(2) {
            opacity: 0;
        }
        
        .mobile-menu-btn.active span:nth-child(3) {
            transform: rotate(-45deg) translate(5px, -5px);
        }
    }
`;
document.head.appendChild(style);

// GitHub Release Automation
function fetchLatestVersion() {
    const REPO = 'hslee5141-web/lunarview-remote';
    const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

    fetch(API_URL)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            const version = data.tag_name; // e.g., v1.1.0
            const versionClean = version.replace('v', ''); // 1.1.0
            const downloadUrl = `https://github.com/${REPO}/releases/download/${version}/LunarView.Setup.${versionClean}.exe`;

            // Update Windows elements
            const winVersionEl = document.getElementById('win-version');
            const winDownloadEl = document.getElementById('win-download');

            if (winVersionEl) {
                winVersionEl.textContent = `버전 ${versionClean} | 80MB`;
            }
            if (winDownloadEl) {
                winDownloadEl.href = downloadUrl;
            }

            // Update All Versions link
            const allVersionsEls = document.querySelectorAll('.all-versions-link');
            allVersionsEls.forEach(el => {
                el.href = `https://github.com/${REPO}/releases/tag/${version}`;
            });

            console.log(`Updated download links to ${version}`);
        })
        .catch(error => {
            console.error('Failed to fetch latest version:', error);
        });
}
