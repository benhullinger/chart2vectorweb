const lastFiles = {
    tick: null,
    path: null,
    combined: null
};

function generateSVG(tickPositions, width, height) {
    const svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        ${tickPositions.map(([x, y]) => `
            <path d="M ${x} ${height-y-5} L ${x} ${height-y+5} M ${x-5} ${height-y} L ${x+5} ${height-y}"
                  stroke="black" 
                  stroke-width="1" 
                  fill="none"/>
        `).join('')}
    </svg>`;
    return svg;
}

function generatePathSVG(pathPoints, width, height) {
    const pathData = `M ${pathPoints[0][0]} ${pathPoints[0][1]} ` + 
                    pathPoints.slice(1).map(([x, y]) => `L ${x} ${y}`).join(' ');
    
    const svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        <path d="${pathData}" stroke="black" stroke-width="1" fill="none"/>
    </svg>`;
    return svg;
}

function setLoading(element, isLoading) {
    element.classList.toggle('processing', isLoading);
    const inputId = element.id === 'dropZone' ? 'tickFileInput' : 
                    element.id === 'pathDropZone' ? 'pathFileInput' : 
                    'combinedFileInput';
                    
    if (isLoading) {
        element.setAttribute('data-original-content', element.innerHTML);
        element.innerHTML = '<span>Processing...</span>';
    } else {
        const dropMessage = element.id === 'dropZone' ? 'Drop your tick marks image here' :
                           element.id === 'pathDropZone' ? 'Drop your path image here' :
                           'Drop your image here (with ticks and curve)';
                           
        element.innerHTML = `
            <span>${dropMessage}</span>
            <small>or</small>
            <button class="button" onclick="document.getElementById('${inputId}').click()">
                Choose File
            </button>
            <input type="file" id="${inputId}" class="file-input" accept="image/*">
        `;
        
        // Reattach event listener to new file input
        document.getElementById(inputId).addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const previewId = element.id === 'dropZone' ? 'preview' :
                                 element.id === 'pathDropZone' ? 'pathPreview' :
                                 'combinedPreview';
                const resultsId = element.id === 'dropZone' ? 'results' :
                                 element.id === 'pathDropZone' ? 'pathResults' :
                                 'combinedResults';
                cleanupPreviousUpload(previewId, resultsId);
                
                if (element.id === 'dropZone') processImage(file);
                else if (element.id === 'pathDropZone') processPathImage(file);
                else traceRightwardPath(file);
            }
        });
    }
}

function handleError(element, error) {
    console.error(error);
    element.classList.remove('processing');
    document.getElementById('results').innerHTML = 
        `<span style="color: #e74c3c">Error: ${error.message}</span>`;
}
    
function showPreview(previewId, resultsId, svgContent, points) {
    const previewContainer = document.getElementById(previewId).parentElement;
    const results = document.getElementById(resultsId);
    
    previewContainer.classList.add('has-content');
    results.classList.add('has-content');
    
    const preview = document.getElementById(previewId);
    preview.innerHTML = svgContent;

    // Add download button to results
    const downloadButton = document.createElement('button');
    downloadButton.className = 'button download-button';
    downloadButton.innerHTML = 'Download SVG';
    downloadButton.onclick = () => downloadSVG(svgContent, 
        previewId === 'preview' ? 'tick_marks.svg' : 'curve_path.svg'
    );

    results.innerHTML = `${previewId === 'preview' ? 
        `Found ${points.length} tick marks` : 
        `Extracted ${points.length} path points`}`;
    results.appendChild(downloadButton);
}

function cleanupPreviousUpload(previewId, resultsId) {
    const previewContainer = document.getElementById(previewId).parentElement;
    const preview = document.getElementById(previewId);
    const results = document.getElementById(resultsId);
    
    // Clear preview
    preview.innerHTML = '';
    previewContainer.classList.remove('has-content');
    
    // Clear results
    results.innerHTML = '';
    results.classList.remove('has-content');

    // Only disable regenerate buttons if we're not about to process a new file
    if (!lastFiles.tick && !lastFiles.path && !lastFiles.combined) {
        if (previewId === 'preview') {
            document.getElementById('tickRegenerate').disabled = true;
        } else if (previewId === 'pathPreview') {
            document.getElementById('pathRegenerate').disabled = true;
        } else if (previewId === 'combinedPreview') {
            document.getElementById('combinedRegenerate').disabled = true;
        }
    }
}

function processImage(imageFile) {
    // Store file and enable regenerate button first
    lastFiles.tick = imageFile;
    document.getElementById('tickRegenerate').disabled = false;
    const dropZone = document.getElementById('dropZone');
    dropZone.setAttribute('data-original-content', dropZone.innerHTML);
    setLoading(dropZone, true);

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        const minHeight = parseInt(document.getElementById('tickMinHeight').value);
        const maxHeight = parseInt(document.getElementById('tickMaxHeight').value);
        const threshold = parseInt(document.getElementById('tickThreshold').value);
        
        // Find tick marks with threshold
        const tickPositions = [];
        for (let x = 0; x < canvas.width; x++) {
            let blackStreak = 0;
            for (let y = 0; y < canvas.height; y++) {
                const idx = (y * canvas.width + x) * 4;
                const isBlack = data[idx] < threshold;
                if (isBlack) {
                    blackStreak++;
                } else if (blackStreak > 0) {
                    if (blackStreak >= minHeight && blackStreak <= maxHeight) {
                        tickPositions.push([x, canvas.height - (y - blackStreak/2)]);
                    }
                    blackStreak = 0;
                }
            }
        }
        
        // Use original SVG generation (no transform)
        const svg = generateSVG(tickPositions, canvas.width, canvas.height);
        showPreview('preview', 'results', svg, tickPositions);
        setLoading(dropZone, false);
    };
    
    img.onerror = function(error) {
        handleError(dropZone, error);
    };

    img.src = URL.createObjectURL(imageFile);
}

function processPathImage(imageFile) {
    // Store file and enable regenerate button first
    lastFiles.path = imageFile;
    document.getElementById('pathRegenerate').disabled = false;
    const dropZone = document.getElementById('pathDropZone');
    dropZone.setAttribute('data-original-content', dropZone.innerHTML);
    setLoading(dropZone, true);

    const canvas = document.getElementById('pathCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        const threshold = parseInt(document.getElementById('pathThreshold').value);
        
        // Convert to binary using threshold
        const binary = new Array(canvas.height).fill().map(() => new Array(canvas.width).fill(0));
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const idx = (y * canvas.width + x) * 4;
                binary[y][x] = data[idx] < threshold ? 1 : 0;
            }
        }
        
        // Find start point (leftmost black pixel)
        const pathPoints = [];
        let startFound = false;
        for (let x = 0; x < canvas.width && !startFound; x++) {
            for (let y = 0; y < canvas.height; y++) {
                if (binary[y][x]) {
                    pathPoints.push([x, y]);
                    startFound = true;
                    break;
                }
            }
        }
        
        // Follow path using 8-direction connectivity
        const directions = [[1,0], [1,-1], [0,-1], [-1,-1], [-1,0], [-1,1], [0,1], [1,1]];
        let [x, y] = pathPoints[0];
        
        while (true) {
            binary[y][x] = 0; // Mark as visited
            let found = false;
            
            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height && binary[ny][nx]) {
                    pathPoints.push([nx, ny]);
                    x = nx;
                    y = ny;
                    found = true;
                    break;
                }
            }
            
            if (!found) break;
        }
        
        const svg = generatePathSVG(pathPoints, canvas.width, canvas.height);
        // Remove downloadSVG call
        showPreview('pathPreview', 'pathResults', svg, pathPoints);
        
        setLoading(dropZone, false);
    };
    
    img.onerror = function(error) {
        handleError(dropZone, error);
    };

    img.src = URL.createObjectURL(imageFile);
}

function downloadSVG(content, filename) {
    const blob = new Blob([content], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// New combined processor functions

function findTickMarks(data, width, height, minHeight, maxHeight, threshold) {
    const tickPositions = [];
    for (let x = 0; x < width; x++) {
        let blackStreak = 0;
        for (let y = 0; y < height; y++) {
            const idx = (y * width + x) * 4;
            if (data[idx] < threshold) {
                blackStreak++;
            } else if (blackStreak > 0) {
                if (blackStreak >= minHeight && blackStreak <= maxHeight) {
                    tickPositions.push([x, y - blackStreak / 2]); // Remove height flipping here
                }
                blackStreak = 0;
            }
        }
    }
    return tickPositions;
}

function findNearestTick(point, tickPositions, maxDistance = 30) {
    let nearest = null;
    let minDist = maxDistance;

    for (const tick of tickPositions) {
        const dist = Math.hypot(tick[0] - point[0], tick[1] - point[1]);
        if (dist < minDist) {
            minDist = dist;
            nearest = tick;
        }
    }
    return nearest;
}

function traceRightwardPath(imageFile) {
    // Store file and enable regenerate button first
    lastFiles.combined = imageFile;
    document.getElementById('combinedRegenerate').disabled = false;
    const dropZone = document.getElementById('combinedDropZone');
    cleanupPreviousUpload('combinedPreview', 'combinedResults');
    dropZone.setAttribute('data-original-content', dropZone.innerHTML);
    setLoading(dropZone, true);

    const canvas = document.getElementById('combinedCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = function () {
        try {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            const minHeight = parseInt(document.getElementById('combinedMinHeight').value);
            const maxHeight = parseInt(document.getElementById('combinedMaxHeight').value);
            const threshold = parseInt(document.getElementById('combinedThreshold').value);

            // First detect ticks without modifying the image
            const tickPositions = findTickMarks(data, canvas.width, canvas.height, minHeight, maxHeight, threshold);
            console.log(`Found ${tickPositions.length} tick marks`);

            // Convert to binary for path tracing
            const binary = new Array(canvas.height).fill().map(() => new Array(canvas.width).fill(0));
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const idx = (y * canvas.width + x) * 4;
                    binary[y][x] = data[idx] < threshold ? 1 : 0; // Use original threshold
                }
            }

            // Remove tick marks from binary image
            for (let x = 0; x < canvas.width; x++) {
                let blackStreak = 0;
                for (let y = 0; y < canvas.height; y++) {
                    if (binary[y][x] === 1) {
                        blackStreak++;
                    } else if (blackStreak > 0) {
                        // If streak matches tick mark height, remove it
                        if (blackStreak >= minHeight && blackStreak <= maxHeight) {
                            for (let i = 0; i < blackStreak; i++) {
                                binary[y - i - 1][x] = 0;
                            }
                        }
                        blackStreak = 0;
                    }
                }
            }

            // Trace path segments (right/down only)
            const pathSegments = [];
            let currentSegment = [];

            function isValidPathPoint(x, y) {
                if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return false;
                return binary[y][x] === 1;
            }

            function getNextPoint(x, y) {
                const right = isValidPathPoint(x + 1, y);
                const down = isValidPathPoint(x, y + 1);

                if (right && down) return null;
                if (right) return [x + 1, y];
                if (down) return [x, y + 1];
                return null;
            }

            // Find and trace segments
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    if (binary[y][x] === 1 && (!isValidPathPoint(x - 1, y) && !isValidPathPoint(x, y - 1))) {
                        currentSegment = [[x, y]];
                        binary[y][x] = 2; // Mark as visited

                        let cx = x, cy = y;
                        while (true) {
                            const next = getNextPoint(cx, cy);
                            if (!next) break;

                            const [nx, ny] = next;
                            currentSegment.push([nx, ny]); // Store original y
                            binary[ny][nx] = 2;
                            cx = nx;
                            cy = ny;
                        }

                        if (currentSegment.length > 1) {
                            pathSegments.push([...currentSegment]);
                        }
                        currentSegment = [];
                    }
                }
            }

            // Generate SVG with paths and ticks - flip the entire viewBox
            const svg = `<svg viewBox="0 0 ${canvas.width} ${canvas.height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
                <g transform="scale(1, 1) translate(0, 0)">
                    <!-- Path segments -->
                    ${pathSegments.map(segment => {
                const pathData = `M ${segment[0][0]} ${segment[0][1]} ` +
                    segment.slice(1).map(([x, y]) => `L ${x} ${y}`).join(' ');
                return `<path d="${pathData}" stroke="black" stroke-width="1" fill="none"/>`;
            }).join('\n')}
                    
                    <!-- Tick marks -->
                    ${tickPositions.map(([x, y]) => `
                        <path d="M ${x} ${y - 5} L ${x} ${y + 5} M ${x - 5} ${y} L ${x + 5} ${y}"
                              stroke="green" stroke-width="1" fill="none"/>
                    `).join('\n')}
                </g>
            </svg>`;

            showPreview('combinedPreview', 'combinedResults', svg, pathSegments.flat());

        } catch (error) {
            console.error('Processing error:', error);
            handleError(dropZone, error);
        }
        setLoading(dropZone, false);
    };

    img.onerror = function (error) {
        handleError(dropZone, error);
    };

    img.src = URL.createObjectURL(imageFile);
}

// Add event listeners for regenerate buttons
document.getElementById('tickRegenerate').addEventListener('click', () => {
    if (lastFiles.tick) processImage(lastFiles.tick);
});

document.getElementById('pathRegenerate').addEventListener('click', () => {
    if (lastFiles.path) processPathImage(lastFiles.path);
});

document.getElementById('combinedRegenerate').addEventListener('click', () => {
    if (lastFiles.combined) traceRightwardPath(lastFiles.combined);
});

// Remove the threshold change listeners since we now have regenerate buttons
['tickThreshold', 'pathThreshold', 'combinedThreshold'].forEach(id => {
    document.getElementById(id).removeEventListener('change', () => {});
});

// Define a single setupDropZone function
function setupDropZone(dropZone, processor, previewId, resultsId) {
    const handleDrag = (e) => {
        e.preventDefault();
        dropZone.classList.toggle('drag-over', 
            e.type === 'dragover' || e.type === 'dragenter');
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, handleDrag);
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file?.type.match('image.*')) {
            cleanupPreviousUpload(previewId, resultsId);
            processor(file);
        }
    });
}

// Setup file inputs with cleanup
document.getElementById('tickFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        cleanupPreviousUpload('preview', 'results');
        processImage(file);
    }
});

document.getElementById('pathFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        cleanupPreviousUpload('pathPreview', 'pathResults');
        processPathImage(file);
    }
});

document.getElementById('combinedFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        cleanupPreviousUpload('combinedPreview', 'combinedResults');
        traceRightwardPath(file);
    }
});

// Setup drop zones with proper cleanup IDs (only once)
setupDropZone(document.getElementById('dropZone'), processImage, 'preview', 'results');
setupDropZone(document.getElementById('pathDropZone'), processPathImage, 'pathPreview', 'pathResults');
setupDropZone(document.getElementById('combinedDropZone'), traceRightwardPath, 'combinedPreview', 'combinedResults');
