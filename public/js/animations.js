let isPaused = false;
        const quote = document.getElementById('quote');

        function restartAnimation() {
            const quote = document.getElementById('quote');
            
            // Reset wrapper animation
            quote.style.animation = 'none';
            quote.style.opacity = '1';
            quote.style.filter = 'none';
            quote.style.transform = 'none';
            
            const lines = quote.querySelectorAll('.line');
            const cite = quote.querySelector('cite');
            const boldWords = quote.querySelectorAll('.bold-word');
            
            // Reset all line animations
            lines.forEach(line => {
                line.style.animation = 'none';
                line.style.opacity = '0';
                line.style.filter = 'blur(10px)';
                line.style.transform = 'translateY(20px)';
            });
            
            // Reset all bold word animations
            boldWords.forEach(boldWord => {
                boldWord.style.animation = 'none';
                boldWord.style.opacity = '0';
                boldWord.style.filter = 'blur(10px)';
                boldWord.style.transform = 'none';
                boldWord.style.color = 'white';
                boldWord.style.textShadow = 'none';
            });
            
            // Reset cite animation
            cite.style.animation = 'none';
            cite.style.opacity = '0';
            
            // Force reflow
            quote.offsetHeight;
            
            // Restart animations
            quote.style.animation = null;
            lines.forEach(line => {
                line.style.animation = null;
                line.style.opacity = null;
                line.style.filter = null;
                line.style.transform = null;
            });
            
            boldWords.forEach(boldWord => {
                boldWord.style.animation = null;
                boldWord.style.opacity = null;
                boldWord.style.filter = null;
                boldWord.style.transform = null;
                boldWord.style.color = null;
                boldWord.style.textShadow = null;
            });
            
            cite.style.animation = null;
            cite.style.opacity = null;
            
            quote.classList.remove('paused');
            isPaused = false;
        }

        
         class MalvinasHomepage {
            constructor() {
                this.currentScreen = 0;
                this.screens = document.querySelectorAll('.screen');
                this.progressBar = document.querySelector('.progress-bar');
                this.isTransitioning = false;
                
                // Calculate reading time for the quote
                this.calculateReadingTime();
                this.startProgressBar();
            }

            calculateReadingTime() {
                const quoteText = document.querySelector('.intro__txt').textContent;
                const wordsPerMinute = 200; // Average reading speed
                const words = quoteText.trim().split(/\s+/).length;
                
                // Convert to milliseconds and add buffer time for contemplation
                this.readingTime = Math.max(6000, (words / wordsPerMinute) * 60 * 1000 + 3000);
                
                console.log(`Calculated reading time: ${this.readingTime}ms for ${words} words`);
            }

            startProgressBar() {
                if (!this.progressBar) {
                    console.warn('Progress bar element not found');
                    // Fallback: just wait for reading time then transition
                    setTimeout(() => {
                        this.transitionToSecondScreen();
                    }, this.readingTime);
                    return;
                }

                let progress = 0;
                const interval = 50; // Update every 50ms
                const increment = (interval / this.readingTime) * 100;

                const progressInterval = setInterval(() => {
                    progress += increment;
                    if (this.progressBar) {
                        this.progressBar.style.transform = `scaleX(${progress / 100})`;
                    }
                    
                    if (progress >= 100) {
                        clearInterval(progressInterval);
                        setTimeout(() => {
                            this.transitionToSecondScreen();
                        }, 500); // Small delay after progress completes
                    }
                }, interval);
            }

            transitionToSecondScreen() {
                if (this.isTransitioning || this.currentScreen !== 0) return;
                
                this.isTransitioning = true;
                
                // Hide progress bar safely
                if (this.progressBar) {
                    this.progressBar.style.opacity = '0';
                }
                
                // Start transition
                this.screens[0].classList.add('exiting');
                this.screens[0].classList.remove('active');
                
                setTimeout(() => {
                    this.screens[1].classList.add('active');
                    this.currentScreen = 1;
                    this.isTransitioning = false;
                }, 300);
            }

            transitionToThirdScreen() {
                if (this.isTransitioning || this.currentScreen !== 1) return;
                
                this.isTransitioning = true;
                
                // Start transition with scroll effect for third screen
                this.screens[1].classList.add('exiting');
                this.screens[1].classList.remove('active');
                
                setTimeout(() => {
                    this.screens[2].classList.add('active');
                    this.currentScreen = 2;
                    this.isTransitioning = false;
                    
                    // Initialize Three.js map if needed
                    this.initializeMap();
                }, 300);
            }

            initializeMap() {
                // This is where your Three.js map initialization code would go
                // For now, we'll add a placeholder
                const mapElement = document.getElementById('map');
                if (mapElement && !mapElement.hasChildNodes()) {
                    mapElement.innerHTML = `
                        <div style="
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            height: 100%; 
                            color: white; 
                            font-size: 2rem;
                            background: rgba(0, 0, 0, 0.3);
                            backdrop-filter: blur(10px);
                        ">
                            <div style="text-align: center;">
                                <h2 style="margin-bottom: 1rem;">Mapa Interactivo</h2>
                                <p style="font-size: 1.2rem; opacity: 0.8;">Aquí se cargará el mapa Three.js</p>
                            </div>
                        </div>
                    `;
                }
            }
        }

        // Global function for button click
        function goToThirdScreen() {
            if (window.homepage) {
                window.homepage.transitionToThirdScreen();
            }
        }

        // Initialize the homepage when DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
            window.homepage = new MalvinasHomepage();
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            // Recalculate any size-dependent elements if needed
        });