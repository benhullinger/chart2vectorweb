let lastFile = null;
let isFirstLoad = true;
let xValue = 100;  // Initial max value
let yValue = 100;  // Initial max value

function processImage(file) {
    lastFile = file;
    const img = new Image();
    
    img.onload = () => {
        // Setup processing canvas
        const processingCanvas = document.getElementById('processingCanvas');
        const ctx = processingCanvas.getContext('2d', { willReadFrequently: true });
        processingCanvas.width = img.width;
        processingCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Update resolution sliders max values based on image dimensions
        const xResolution = document.getElementById('xResolution');
        const yResolution = document.getElementById('yResolution');
        
        if (!xResolution || !yResolution) {
            console.error('Resolution controls not found');
            return;
        }

        // Set maximum values to image dimensions
        xResolution.max = img.width;
        yResolution.max = img.height;

        // On first load, set resolution to maintain 1px/unit
        if (isFirstLoad) {
            xValue = img.width;  // One unit per pixel
            yValue = img.height; // One unit per pixel
            xResolution.value = xValue;
            yResolution.value = yValue;
            isFirstLoad = false;
        }

        // Update displays with unit counts and correct ratio
        const xDisplay = document.getElementById('xResolutionValue');
        const yDisplay = document.getElementById('yResolutionValue');
        
        if (xDisplay) {
            const xRatio = (img.width / xValue).toFixed(1);
            xDisplay.textContent = `${xRatio}px/unit (${xValue} units)`;
        }
        if (yDisplay) {
            const yRatio = (img.height / yValue).toFixed(1);
            yDisplay.textContent = `${yRatio}px/unit (${yValue} units)`;
        }

        const options = {
            xResolution: xValue,
            yResolution: yValue,
            imageWidth: img.width,
            imageHeight: img.height,
            threshold: parseInt(document.getElementById('threshold')?.value || '127'),
            maxPaths: parseInt(document.getElementById('maxPaths')?.value || '2'),
            minPathLength: parseInt(document.getElementById('minPathLength')?.value || '5'),
            tickWidth: parseInt(document.getElementById('tickWidth')?.value || '1'),
            minTickHeight: parseInt(document.getElementById('minTickHeight')?.value || '6'),
            maxTickHeight: parseInt(document.getElementById('maxTickHeight')?.value || '7'),
            maxGap: parseInt(document.getElementById('maxGap')?.value || '3')
        };

        // Enable regenerate button and continue processing
        // document.getElementById('regenerate').disabled = false;
        findPathCenters(file, options)
            .then(({paths, ticks, svg}) => {
                const preview = document.getElementById('preview');
                preview.innerHTML = svg;
                preview.parentElement.classList.add('has-content');
                preview.parentElement.parentElement.classList.add('has-content'); // Add this line
                
                const results = document.getElementById('results');
                results.classList.add('has-content');
                
                // Add results text and buttons
                const buttonGroup = document.createElement('div');
                buttonGroup.className = 'button-group';

                const chooseButton = document.createElement('button');
                chooseButton.className = 'button';
                chooseButton.innerHTML = 'Choose New File';
                chooseButton.onclick = () => document.getElementById('fileInput').click();

                const downloadButton = document.createElement('button');
                downloadButton.className = 'button download-button';
                downloadButton.innerHTML = 'Download SVG';
                downloadButton.onclick = () => downloadSVG(svg, 'path_scan.svg');
                
                buttonGroup.appendChild(chooseButton);
                buttonGroup.appendChild(downloadButton);
                
                results.innerHTML = `Found ${paths.length} paths and ${ticks.length} tick marks`;
                results.appendChild(buttonGroup);
                
                const dropZone = document.getElementById('dropZone');
                dropZone.classList.add('has-content');
                dropZone.classList.remove('processing');
            })
            .catch(error => {
                console.error('Processing error:', error);
                const dropZone = document.getElementById('dropZone');
                dropZone.classList.remove('processing');
                document.getElementById('results').innerHTML = 
                    `<span style="color: red">Error: ${error.message}</span>`;
            });

        // Update original image overlay
        const originalImage = document.getElementById('originalImage');
        originalImage.src = URL.createObjectURL(file);
    };
    
    img.src = URL.createObjectURL(file);
}

function findPathCenters(imageFile, options) {
    const processingCanvas = document.getElementById('processingCanvas');
    const ctx = processingCanvas.getContext('2d', { willReadFrequently: true });
    const img = new Image();
    
    return new Promise((resolve, reject) => {
        img.onload = function() {
            try {
                processingCanvas.width = img.width;
                processingCanvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, processingCanvas.width, processingCanvas.height);
                const data = imageData.data;

                const {
                    threshold = 127,
                    maxPaths = 3,
                    minTickHeight = 6,
                    maxTickHeight = 7,
                    tickWidth = 1,
                    maxGap = 5
                } = options;

                const gridX = Math.max(1, options.imageWidth / options.xResolution);
                const gridY = Math.max(1, options.imageHeight / options.yResolution);

                // Helper to check if a pixel is black using averaged RGB
                const isBlack = (x, y) => {
                    const idx = (y * processingCanvas.width + x) * 4;
                    const avg = (data[idx] + data[idx+1] + data[idx+2]) / 3;
                    return avg < threshold * 1.05; // Small margin
                };

                // Find tick marks (look for consistent vertical lines)
                const tickPositions = [];
                let skipToX = 0;  // Track where to resume scanning after a tick

                for (let x = 0; x < processingCanvas.width - tickWidth; x += gridX) {
                    if (x < skipToX) continue;  // Skip if we're in a merged tick region
                    
                    const px = Math.floor(x);
                    let validTickFound = false;
                    
                    // Check each vertical position
                    for (let y = 0; y < processingCanvas.height; y++) {
                        let isValid = true;
                        let height = 0;
                        let width = 0;
                        
                        // Check for maximum possible tick width starting at this x
                        while (width < tickWidth * 2 && px + width < processingCanvas.width) {
                            // Verify vertical line at this width position
                            let isValidColumn = true;
                            for (let ty = y; ty < Math.min(y + minTickHeight, processingCanvas.height); ty++) {
                                if (!isBlack(px + width, ty)) {
                                    isValidColumn = false;
                                    break;
                                }
                            }
                            if (!isValidColumn) break;
                            width++;
                        }
                        
                        // If we found at least the minimum tick width
                        if (width >= tickWidth) {
                            // Count the height at the detected width
                            while (y + height < processingCanvas.height && 
                                  Array.from({length: width}, (_, i) => isBlack(px + i, y + height)).every(Boolean)) {
                                height++;
                            }
                            
                            // Check if height matches tick criteria
                            if (height >= minTickHeight && height <= maxTickHeight) {
                                const centerX = px + Math.floor(width / 2);
                                const centerY = y + height/2;
                                tickPositions.push([
                                    Math.round(centerX / gridX) * gridX,
                                    Math.round(centerY / gridY) * gridY
                                ]);
                                skipToX = px + width;  // Skip the width of this tick
                                validTickFound = true;
                                break;  // Move to next x position
                            }
                        }
                        
                        if (!isValid) continue;
                        y += height || 1; // Skip processed height or move to next pixel
                    }
                    
                    // If no valid tick was found, reset skip position
                    if (!validTickFound) {
                        skipToX = 0;
                    }
                }

                // Create binary grid at path resolution
                const binary = new Array(processingCanvas.height).fill().map(() => new Array(processingCanvas.width).fill(0));
                const allCenterPoints = [];
                
                // Convert image to binary grid - don't remove tick marks
                for (let y = 0; y < processingCanvas.height; y++) {
                    for (let x = 0; x < processingCanvas.width; x++) {
                        if (isBlack(x, y)) {
                            binary[y][x] = 1;
                        }
                    }
                }

                // Convert to grid resolution without removing ticks
                const gridWidth = Math.ceil(processingCanvas.width / gridX);
                const gridHeight = Math.ceil(processingCanvas.height / gridY);
                const grid = new Array(gridHeight).fill().map(() => new Array(gridWidth).fill(0));

                // Convert image to grid at proper resolution
                for (let gy = 0; gy < gridHeight; gy++) {
                    for (let gx = 0; gx < gridWidth; gx++) {
                        const x = Math.floor(gx * gridX);
                        const y = Math.floor(gy * gridY);
                        
                        // Check for black pixels in grid cell
                        let hasBlack = false;
                        for (let dy = 0; dy < gridY && y + dy < processingCanvas.height; dy++) {
                            for (let dx = 0; dx < gridX && x + dx < processingCanvas.width; dx++) {
                                if (isBlack(x + dx, y + dy)) {
                                    hasBlack = true;
                                    break;
                                }
                            }
                            if (hasBlack) break;
                        }
                        grid[gy][gx] = hasBlack ? 1 : 0;
                    }
                }

                // Find paths using manhattan-style movement
                const paths = [];
                const visited = new Array(gridHeight).fill().map(() => new Array(gridWidth).fill(false));

                function tryBuildPath(startX, startY) {
                    const path = [[startX, startY]];
                    let x = startX, y = startY;
                    
                    visited[y][x] = true;
                    
                    let lastDirection = null;  // Track last movement direction
                    
                    while (x < gridWidth && y < gridHeight) {
                        let moved = false;
                        let bestMove = null;
                        let bestScore = -1;
                        
                        // Look ahead up to maxGap cells for valid moves
                        for (let lookAhead = 1; lookAhead <= options.maxGap && !moved; lookAhead++) {
                            // Check right
                            if (x + lookAhead < gridWidth && grid[y][x + lookAhead] === 1 && !visited[y][x + lookAhead]) {
                                const score = lastDirection === 'right' ? 12 : 10;  // Prefer continuing in same direction
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestMove = {dx: lookAhead, dy: 0, direction: 'right'};
                                }
                            }
                            
                            // Check down (only if not moving right)
                            if (y + lookAhead < gridHeight && grid[y + lookAhead][x] === 1 && !visited[y + lookAhead][x]) {
                                const score = lastDirection === 'down' ? 10 : 8;  // Prefer continuing down if already moving down
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestMove = {dx: 0, dy: lookAhead, direction: 'down'};
                                }
                            }
                        }

                        if (bestMove) {
                            x += bestMove.dx;
                            y += bestMove.dy;
                            visited[y][x] = true;
                            path.push([x, y]);
                            lastDirection = bestMove.direction;
                            moved = true;
                        }

                        if (!moved) break;
                    }

                    return path;
                }

                // Find paths starting from leftmost column
                for (let y = 0; y < gridHeight; y++) {
                    if (grid[y][0] === 1 && !visited[y][0]) {
                        const path = tryBuildPath(0, y);
                        if (path.length >= options.minPathLength) {
                            const pixelPath = path.map(([gx, gy]) => [gx * gridX, gy * gridY]);
                            paths.push(pixelPath);
                            allCenterPoints.push(...pixelPath);
                        }
                    }
                }

                // Try to find additional paths from unvisited black cells
                for (let y = 0; y < gridHeight; y++) {
                    for (let x = 1; x < gridWidth; x++) {
                        if (grid[y][x] === 1 && !visited[y][x]) {
                            const path = tryBuildPath(x, y);
                            if (path.length >= options.minPathLength) {
                                const pixelPath = path.map(([gx, gy]) => [gx * gridX, gy * gridY]);
                                paths.push(pixelPath);
                                allCenterPoints.push(...pixelPath);
                            }
                        }
                    }
                }

                // Sort paths by length (longest first) and take only the requested number
                const processedPaths = paths
                    .sort((a, b) => b.length - a.length)
                    .slice(0, options.maxPaths);

                // Snap tick marks to nearest path points
                const snapTicksToPath = (ticks, paths) => {
                    return ticks.map(([tickX, tickY]) => {
                        // Find path points at this x-coordinate
                        let bestMatch = null;
                        let minDistance = Infinity;
                        
                        paths.forEach(path => {
                            path.forEach(([px, py]) => {
                                if (Math.abs(px - tickX) <= gridX) {  // Only consider points near the tick's x-coord
                                    const distance = Math.abs(py - tickY);
                                    if (distance < minDistance) {
                                        minDistance = distance;
                                        bestMatch = [px, py];
                                    }
                                }
                            });
                        });
                        
                        // If we found a nearby path point, snap to its y-coordinate
                        return bestMatch && minDistance < gridY * 2 ? 
                            [tickX, bestMatch[1]] : [tickX, tickY];
                    });
                };

                const adjustedTicks = snapTicksToPath(tickPositions, processedPaths);

                // Generate SVG with the processed paths (without center points)
                const medianTickHeight = Math.round((options.minTickHeight + options.maxTickHeight) / 2);
                const svg = `<svg viewBox="0 0 ${processingCanvas.width} ${processingCanvas.height}" 
                                 preserveAspectRatio="xMidYMid meet" 
                                 xmlns="http://www.w3.org/2000/svg">
                    ${processedPaths.map(path => 
                        `<path d="M ${path[0][0]} ${path[0][1]} 
                                ${path.slice(1).map(([x, y]) => `L ${x} ${y}`).join(' ')}"
                              stroke="red" stroke-width="1" fill="none"/>`
                    ).join('\n')}
                    ${adjustedTicks.map(([x, y]) => 
                        `<path d="M ${x} ${y-medianTickHeight} L ${x} ${y+medianTickHeight} M ${x-5} ${y} L ${x+5} ${y}"
                              stroke="green" stroke-width="1" fill="none"/>`
                    ).join('\n')}
                </svg>`;

                resolve({ 
                    paths: processedPaths,
                    ticks: adjustedTicks,  // Use adjusted ticks in response
                    centerPoints: allCenterPoints,
                    svg 
                });

            } catch (error) {
                reject(error);
            }
        };
        
        img.onerror = reject;
        img.src = URL.createObjectURL(imageFile);
    });
}

function downloadSVG(content, filename) {
    const blob = new Blob([content], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// Event Listeners
['fileInput', 'threshold', 'tickWidth', 'minTickHeight', 'maxTickHeight'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener(id === 'fileInput' ? 'change' : 'input', (e) => {
            if (id === 'fileInput') {
                const file = e.target.files[0];
                if (file) processImage(file);
            } else if (lastFile) {
                processImage(lastFile);
            }
        });
    }
});

// Slider event listeners with debounce
let sliderTimeout;
['xResolution', 'yResolution', 'maxPaths', 'minPathLength', 'maxGap'].forEach(id => {
    const slider = document.getElementById(id);
    if (!slider) return;

    // Set initial slider values to maximum for resolution sliders only
    if (id === 'xResolution' || id === 'yResolution') {
        slider.value = slider.max;
    }
    
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const display = document.getElementById(`${id}Value`);
        
        if (id === 'xResolution' || id === 'yResolution') {
            const dimension = id === 'xResolution' ? 'width' : 'height';
            const processingCanvas = document.getElementById('processingCanvas');
            
            if (id === 'xResolution') xValue = value;
            else yValue = value;
            
            if (display && processingCanvas) {
                const pxPerUnit = (processingCanvas[dimension] / value);
                display.textContent = `${pxPerUnit.toFixed(1)}px/unit (${value} units)`;
            }
        } else {
            // Handle non-resolution sliders
            if (display) {
                if (id === 'maxPaths') {
                    display.textContent = `${value} paths`;
                } else {
                    display.textContent = `${value} units`;
                }
            }
        }
        
        clearTimeout(sliderTimeout);
        sliderTimeout = setTimeout(() => {
            if (lastFile) processImage(lastFile);
        }, 300);
    });
});

// Add tooltips to control groups
const tooltips = {
    resolution: "Controls how many units the image will be divided into. Higher values mean more detail but slower processing.",
    paths: `Path Detection Settings:
<ul>
<li>Max Paths: Maximum number of separate lines to detect. Start with a low number and increase if you have multiple lines.</li>
<li>Min Path Length: How many points a path needs to be considered valid. Increase to filter out noise and small marks.</li>
<li>Max Gap: How far to look ahead when connecting points. Larger values help bridge gaps in dotted or broken lines.</li>
</ul>`,
    threshold: "Brightness threshold for detecting black pixels. Adjust if the lines are not being detected properly.",
    ticks: "Controls for detecting tick marks along the paths. Adjust width and height to match your tick marks."
};

function addTooltip(sectionId, text) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    if (!section) return;

    const header = section.querySelector('h4');
    if (!header) return;

    const infoIcon = document.createElement('span');
    infoIcon.className = 'info-icon';
    infoIcon.textContent = 'i';
    
    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    tooltip.innerHTML = text; // Changed from textContent to innerHTML to support list formatting
    
    infoIcon.appendChild(tooltip);
    header.appendChild(infoIcon);
}

// Update tooltip initialization
addTooltip('resolution', tooltips.resolution);
addTooltip('paths', tooltips.paths);
addTooltip('ticks', tooltips.ticks);
addTooltip('processing', tooltips.threshold);

// Drop zone handling
const dropZone = document.getElementById('dropZone');
const compareContainer = dropZone.parentElement;

compareContainer.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.remove('has-content');
    dropZone.classList.add('drag-over');
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.toggle('drag-over', 
            e.type === 'dragover' || e.type === 'dragenter');
    });
});

dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file?.type.match('image.*')) {
        processImage(file);
    }
});

// Add overlay controls
const showOriginalCheckbox = document.getElementById('showOriginal');
if (showOriginalCheckbox) {
    showOriginalCheckbox.checked = true;
    const originalImage = document.getElementById('originalImage');
    originalImage.style.display = 'block';
}

showOriginalCheckbox.addEventListener('change', (e) => {
    const originalImage = document.getElementById('originalImage');
    originalImage.style.display = e.target.checked ? 'block' : 'none';
});

document.getElementById('opacity').addEventListener('input', (e) => {
    const originalImage = document.getElementById('originalImage');
    const value = e.target.value;
    originalImage.style.opacity = value / 100;
    document.getElementById('opacityValue').textContent = `${value}%`;
});

// Update all numeric inputs to be range sliders with value display
['threshold', 'tickWidth', 'minTickHeight', 'maxTickHeight'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        const valueDisplay = document.getElementById(`${id}Value`);
        element.addEventListener('input', (e) => {
            if (valueDisplay) {
                valueDisplay.textContent = id.toLowerCase().includes('tick') ? `${e.target.value} px` : e.target.value;
            }
            if (lastFile) {
                clearTimeout(sliderTimeout);
                sliderTimeout = setTimeout(() => processImage(lastFile), 300);
            }
        });
    }
});
