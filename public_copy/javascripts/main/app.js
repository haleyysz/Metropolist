/*
    clusters = [Item, Item, Item, ..., Item]
    polygons = [Polygon, Polygon, Polygon, ..., Polygon]
========================================
    Edge {
        endpoint1: {x, y},
        endpoint2: {x, y},
        left: {x, y, index},
        right[optional]: {x, y, index}
    }
========================================
    Item {
        width: Int,
        height: Int,
        radius: Int,
        x: Float,
        y: Float,
        vx: Float,
        vy: Float,
        sign: Int,
        offset: Int,
        random: Float,
        parent: Polygon,
        orientation: Float,
        symbol: one of ['symbolCircle', 'symbolCross', 'symbolDiamond', 'symbolSquare', 'symbolStar', 'symbolTriangle', 'symbolWye']
    }
========================================
    Polygon {
        index: Int,
        area: Float,
        site: [x, y],
        buildings: Int,
        center: [x, y],
        path: SVG path,
        simulation: Object,
        bounds: [width, height],
        children: [Item, Item, Item, ..., Item],
        halfedges: [Edge, Edge, Edge, ..., Edge],
        vertices : [[x1, y1], [x2, y2], ..., [xn, yn]],
        type : one of ['rich', 'medium', 'poor', 'plaza'],
    }
 */

/* Data need to be loaded :
*   sites: JSON -> Object,
*   clusters: JSON -> Object,
*
* */
function Metro(canvas, data) {
    $(document).ready(function () {
        $('#render').click(function () {
            newGraphics();
        });

        $('#distance').on('change', function () {
            tick();
        });

        $('#segment').on('change', function () {
            tick();
        });

        $('#startWarp').click(function () {
            $('#startWarp').attr('hidden', true);
            $('#stopWarp').removeAttr('hidden', true);
            $('#dragSwitch').attr('disabled', true);
            $('#simulateSwitch').attr('disabled', true);
            $('#input-sites').attr('disabled', true);
            $('#render').attr('disabled', true);

            state.isWarpMode = true;
            startWarpMode();
        });

        $('#stopWarp').click(function () {
            $('#stopWarp').attr('hidden', true);
            $('#startWarp').removeAttr('hidden', true);
            $('#dragSwitch').removeAttr('disabled', true);
            $('#simulateSwitch').removeAttr('disabled', true);
            $('#input-sites').removeAttr('disabled', true);
            $('#render').removeAttr('disabled', true);

            state.isWarpMode = false;
            stopWarpMode();
        });

        $('#dragSwitch').on('change', function () {
            if (this.checked) {
                state.isDragSelected = true; // single
            } else {
                state.isDragSelected = false; // multiple
            }
        });

        $('#simulateSwitch').on('change', function () {
            if (this.checked) {
                state.isSimulatingSelected = true; // drag
                if (state.simulations.length !== 0) {
                    restartSimulations();
                }
            } else {
                state.isSimulatingSelected = false; // simulating
                if (state.simulations.length !== 0) {
                    stopSimulations();
                }
            }
        });
    });
    /*
        canvas: HTMLElement;
        data: {
            sites: Object,
            clusters: Object,
        }
    */
    var state = {
        N: data ? data.sites.length : 30, // quantity of polygons
        SIGN: Math.random() < 0.5 ? -1 : 1, // make positive or negative 1
        vertices: [],
        simulations: [],
        verticesSimulations: [],
        isWarpMode: false,
        isDragSelected: false,
        isSimulatingSelected: false,
        DRAGGED_SUBJECT: null,
        transform: d3.zoomIdentity, // scale parameter of zoom
        canvas: canvas.node() || d3.select("canvas").node(),
        width() {
            return this.canvas.width;
        },
        height() {
            return this.canvas.height;
        },
        context() {
            return this.canvas.getContext("2d");
        },
        COLOR: d3.scaleOrdinal().range(d3.schemeCategory20), // random color
        DISTRICT_TYPES: ['rich', 'medium', 'poor', 'plaza', 'empty'] // four types of districts
    };

    state.graphics = new Graphics();
    console.log(state.graphics);

    /*=====================================================================================================
                                         Constructor Functions
    ======================================================================================================*/
    function Graphics() {
        this.sites = makeSites();
        this.voronoi = d3.voronoi().extent([[20, 20], [state.width() - 20, state.height() - 20]]);
        this.diagram = this.voronoi(this.sites);
        this.polygons = makePolygons(this.diagram);
        this.edges = this.diagram.edges;
        this.links = this.diagram.links();
        this.triangles = this.diagram.triangles();
        this.clusters = data ? data.clusters : this.polygons.map(makeCluster);
        this.buildings = getBuildings(this.clusters);
    }

    // make sites
    function makeSites() {
        let sites = [];

        if (data) {
            sites = data.sites;
        } else {
            sites = d3.range(state.N).map(() => [Math.random() * state.width(), Math.random() * state.height()]);
            sites.forEach(s => {
                s.color = null;
                return s;
            });
        }
        return sites;
    }

    // make polygons(districts)
    function makePolygons(diagram) {
        return diagram.cells.map((cell, index) => {
            let polygon = {};
            let vertices = cell.halfedges.map(i => {
                let vertex = cellHalfedgeStart(cell, diagram.edges[i]);
                polygon.site = {x: cell.site[0], y: cell.site[1], index: cell.site.index, color: null};
                vertex.x = vertex[0];
                vertex.y = vertex[1];
                state.vertices.push({x: vertex[0], y: vertex[1], index: i});
                return vertex;
            });
            polygon.index = index;
            polygon.children = null;
            polygon.vertices = vertices;
            polygon.bounds = bounds(vertices);
            polygon.area = Math.abs(d3.polygonArea(vertices));
            polygon.center = {x: d3.polygonCentroid(vertices)[0], y: d3.polygonCentroid(vertices)[1]};
            polygon.type = getType(polygon);
            switch (polygon.type) {
                case 'rich':
                    polygon.site.color = 'blue';
                    cell.site.data.color = 'blue';
                    break;
                case 'medium':
                    polygon.site.color = 'red';
                    cell.site.data.color = 'red';
                    break;
                case 'poor':
                    polygon.site.color = 'green';
                    cell.site.data.color = 'green';
                    break;
                case 'plaza':
                    polygon.site.color = 'yellow';
                    cell.site.data.color = 'yellow';
                    break;
                case 'empty':
                    polygon.site.color = 'white';
                    cell.site.data.color = 'white';
                    break;
            }
            return polygon;
        });

        function getType(poly) {
            let x = Math.abs(poly.center.x - state.width() / 2);
            let y = Math.abs(poly.center.y - state.height() / 2);
            let distance = Math.sqrt(x * x + y * y);
            distance = distance / Math.sqrt((state.width() * state.width()) / 4 + (state.height() * state.height()) / 4);

            if (distance > .6) {
                return 'empty';
            } else {
                return state.DISTRICT_TYPES[Math.floor(Math.random() * 4)];
            }
        }
    }

    // make clusters
    function makeCluster(poly) {
        let number = 0,
            width = poly.bounds.width,
            height = poly.bounds.height;
        switch (poly.type) {
            case 'rich':
                number = classifyCluster(Math.round(Math.random() * Math.round(height / 35) + 3), Math.round(Math.random() * 1) + 3);
                break;
            case 'medium':
                number = classifyCluster(Math.round(Math.random() * Math.round(height / 25) + 4), Math.round(Math.random() * 2) + 3);
                break;
            case 'poor':
                number = classifyCluster(Math.round(Math.random() * Math.round(height / 20) + 5), Math.round(Math.random() * 3) + 3);
                break;
            case 'plaza':
                number = classifyCluster(3, 1);
                break;
            case 'empty':
                number = 0;
                break;
            default:
                number = Math.round(Math.random() * 10 + 5);
        }

        let dots = d3.range(number).map(() => {
            let d = {
                orientation: 0.0,
                parent: poly.index,
            };
            switch (poly.type) {
                case 'rich':
                    d.width = Math.round(Math.random() * 10 + width / 10);
                    d.height = Math.round(Math.random() * 10 + height / 10);
                    break;
                case 'medium':
                    d.width = Math.round(Math.random() * 10 + width / 20);
                    d.height = Math.round(Math.random() * 10 + height / 20);
                    break;
                case 'poor':
                    d.width = Math.round(Math.random() * 10 + width / 30);
                    d.height = Math.round(Math.random() * 10 + height / 30);
                    break;
                case 'plaza':
                    d.width = Math.round(Math.random() * 10 + width / number / 2.8);
                    d.height = Math.round(Math.random() * 10 + height / number / 2.8);
                    break;
                default:
                    d.width = Math.round(Math.random() * 10 + poly.bounds.width / number);
                    d.height = Math.round(Math.random() * 10 + poly.bounds.width / number);
            }
            d.random = Math.random();
            d.sign = d.random < 0.5 ? -1 : 1;
            d.offset = {x: Math.round(Math.random() * d.width / 2), y: Math.round(Math.random() * d.height / 2)};
            d.radius = Math.sqrt(sqr(d.width / 2) + sqr(d.height / 2));
            return d;
        });
        poly.children = dots;
        return dots;

        function classifyCluster(more, less) {
            if (poly.center.x > state.width() / 4 && poly.center.x < state.width() * 4 / 5 && poly.center.y > state.height() / 4 && poly.center.y < state.height() * 4 / 5) {
                return more;
            } else {
                return less;
            }
        }
    }

    // get buildings from clusters
    function getBuildings(clusters) {
        let buildings = [];

        for (let i = 0; i < clusters.length; i++) {
            let cluster = clusters[i];

            if (!cluster) return;

            if (cluster.length !== 0) {
                for (let building of cluster) {
                    buildings.push(building);
                }
            }
        }
        return buildings;
    }

    /*=====================================================================================================
                                             Main Functions
    ======================================================================================================*/
    startSimulations();

    // initialize drag event
    d3.select(state.canvas)
        .call(d3.drag()
            .container(state.canvas)
            .subject(dragsubject)
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .call(d3.zoom().scaleExtent([1 / 2, 4]).on("zoom", zoomed))
        .on("contextmenu", d3.contextMenu(menu));

    d3.select("body")
        .on("keydown", onKeyDown);

    // render graphics
    function tick() {
        state.context().clearRect(0, 0, state.width(), state.height());

        // renderBackground();
        // drawTriangles();
        // drawLink();
        // drawSites();
        // drawCenters('green');
        drawEdges(2, 'black');

        // draw clusters
        for (let k = 0; k < state.graphics.polygons.length; k++) {
            for (let i = 0; i < state.graphics.clusters[k].length; i++) {
                let d = state.graphics.clusters[k][i];
                state.context().save();
                state.context().beginPath();
                state.context().translate(state.transform.x, state.transform.y);
                state.context().scale(state.transform.k, state.transform.k);
                state.context().translate(d.x, d.y);
                state.context().rotate(d.orientation);
                state.context().translate(-(d.x), -(d.y));
                state.context().lineWidth = 3;
                if (d.random < .79) {
                    state.context().rect(d.x - d.width / 2, d.y - d.height / 2, d.width, d.height);
                    state.context().globalCompositeOperation = 'destination-over';
                    state.context().rect(d.x - d.offset.x, d.y - d.offset.y, d.width - d.offset.x, d.height - d.offset.y);
                } else if (d.random > .8) {
                    state.context().rect(d.x - d.width / 2, d.y - d.height / 2, d.width, d.height);
                    state.context().globalCompositeOperation = 'destination-over';
                    state.context().arc(d.x + d.sign * d.offset.x, d.y + d.sign * d.offset.y, d.radius / 2, 0, 2 * Math.PI);
                } else {
                    state.context().lineWidth = 1.5;
                    state.context().arc(d.x, d.y, d.radius, 0, 2 * Math.PI);
                }
                state.context().fillStyle = "#98948b";
                state.context().fill();
                state.context().strokeStyle = "#000";
                state.context().stroke();
                state.context().restore();
            }
        }
        // draw dragging circle
        if (state.isDragSelected && state.DRAGGED_SUBJECT) {
            let d = state.DRAGGED_SUBJECT;
            state.context().save();
            state.context().beginPath();
            state.context().translate(state.transform.x, state.transform.y);
            state.context().scale(state.transform.k, state.transform.k);
            state.context().clearRect(d.x - d.width / 2, d.y - d.height / 2, d.width, d.height);
            state.context().translate(d.x, d.y);
            state.context().rotate(d.orientation);
            state.context().translate(-(d.x), -(d.y));
            let dist = Math.max(d.offset.x, d.offset.y, Math.sqrt(sqr(d.offset.x) + sqr(d.offset.y)));
            state.context().moveTo(d.x + d.radius, d.y);
            state.context().arc(d.x, d.y, d.radius, 0, 2 * Math.PI);
            state.context().fillStyle = "#CBC5B9";
            state.context().fill();
            state.context().strokeStyle = "#000";
            state.context().lineWidth = 1.5;
            state.context().stroke();
            state.context().clip();
            state.context().restore();
        }
    }

    /*=====================================================================================================
                                      Additional Functions
    ======================================================================================================*/

    // start simulations
    function startSimulations() {
        // make simulations among buildings
        state.graphics.polygons.forEach(p => makeSimulations(p, p.children));

        if (state.isSimulatingSelected) {
            restartSimulations();
        }

        setTimeout(() => {
            if (!state.isSimulatingSelected) {
                stopSimulations();
            }
        }, 0);
    }

    function newGraphics() {
        state.N = $('#input-sites').val() || 30;
        state.simulations.forEach(s => s.stop());
        state.graphics = new Graphics();

        startSimulations();
    }

    function restartSimulations() {
        state.simulations.forEach(s => s.restart());
    }

    function stopSimulations() {
        state.simulations.forEach(s => s.stop());
    }

    function startWarpMode() {
        stopSimulations();
        drawVertices();
    }

    function stopWarpMode() {
        tick();
    }

    // make simulations in using d3.forceSimulation
    function makeSimulations(polygon, cluster) {
        let collision = Math.sqrt(polygon.area / polygon.children.length) / Math.sqrt(2) / 2;
        let distance = Math.max(polygon.bounds.width, polygon.bounds.height) / 2;
        state.simulations[polygon.index] = d3.forceSimulation(cluster)
            .force("center", d3.forceCenter(polygon.center.x, polygon.center.y))
            .force("collide", d3.forceCollide(d => d.radius + 10).iterations(2))
            // .force("collide", d3.forceCollide(20).iterations(2))
            .force("polygonCollide", forceCollidePolygon(polygon))
            .force("myForce", myForce().distanceMin(20).distanceMax(distance).iterations(4))
            .on("tick", tick);

        polygon.simulation = state.simulations[polygon.index];
    }

    // set zoom arguments
    function zoomed() {
        state.transform = d3.event.transform;
        tick();
    }

    // set context menu
    function menu(d) {
        let x = state.transform.invertX(d3.event.layerX);
        let y = state.transform.invertY(d3.event.layerY);
        let point = [x, y];
        let polygon = state.graphics.polygons.filter(poly => d3.polygonContains(poly.vertices, point))[0];
        return [{
            title: 'Current Type: ' + polygon.type,
        },
            {
                divider: true
            },
            {
                title: 'Change type to Rich',
                action: function () {
                    polygon.type = 'rich';
                    polygon.site.color = 'blue';
                    remakeCluster(polygon);
                    $('#stopWarp').click();
                }
            },
            {
                title: 'Change type to Medium',
                action: function () {
                    polygon.type = 'medium';
                    polygon.site.color = 'red';
                    remakeCluster(polygon);
                    $('#stopWarp').click();
                }
            },
            {
                title: 'Change type to Poor',
                action: function () {
                    polygon.type = 'poor';
                    polygon.site.color = 'green';
                    remakeCluster(polygon);
                    $('#stopWarp').click();
                }
            },
            {
                title: 'Change type to Plaza',
                action: function () {
                    polygon.type = 'plaza';
                    polygon.site.color = 'yellow';
                    remakeCluster(polygon);
                    $('#stopWarp').click();
                }
            },
            {
                title: 'Change type to Empty',
                action: function () {
                    polygon.type = 'empty';
                    polygon.site.color = 'white';
                    remakeCluster(polygon);
                    $('#stopWarp').click();
                }
            }];
    };

    // remake cluster after change its parent's type
    function remakeCluster(polygon) {
        let cluster = makeCluster(polygon);
        state.graphics.clusters.splice(polygon.index, 1, cluster);
        makeSimulations(polygon, cluster);
    }

    // custom force
    function myForce() {
        var nodes,
            node,
            alpha,
            strength = constant(-12),
            strengths,
            distanceMin2 = 1,
            distanceMax2 = Infinity,
            theta2 = 0.81;

        function initialize() {
            if (!nodes) return;
            var i, n = nodes.length, node;
            strengths = new Array(n);
            // for (i = 0; i < n; ++i) node = nodes[i], strengths[node.index] = +strength(node, i, nodes);
            for (i = 0; i < n; ++i) node = nodes[i], strengths[node.index] = -node.radius;
        }

        function force(_) {
            var i, n = nodes.length, tree = d3.quadtree(nodes, d3.x$1, d3.y$1).visitAfter(accumulate);
            for (alpha = _, i = 0; i < n; ++i) node = nodes[i], tree.visit(apply);
        }

        function accumulate(quad) {
            var strength = 0, q, c, weight = 0, x, y, i;

            // For internal nodes, accumulate forces from child quadrants.
            if (quad.length) {
                for (x = y = i = 0; i < 4; ++i) {
                    if ((q = quad[i]) && (c = Math.abs(q.value))) {
                        strength += q.value, weight += c, x += c * q.x, y += c * q.y;
                    }
                }
                quad.x = x / weight;
                quad.y = y / weight;
            }

            // For leaf nodes, accumulate forces from coincident quadrants.
            else {
                q = quad;
                q.x = q.data.x;
                q.y = q.data.y;
                do strength += strengths[q.data.index];
                while (q = q.next);
            }
            quad.value = strength;
        }

        function apply(quad, x1, _, x2) {
            if (!quad.value) return true;

            var x = quad.x - node.x,
                y = quad.y - node.y,
                w = x2 - x1,
                l = x * x + y * y;

            // Apply the Barnes-Hut approximation if possible.
            // Limit forces for very close nodes; randomize direction if coincident.
            if (w * w / theta2 < l) {
                if (l < distanceMax2) {
                    if (x === 0) x = jiggle(), l += x * x;
                    if (y === 0) y = jiggle(), l += y * y;
                    if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
                    node.vx += x * quad.value * alpha / l;
                    node.vy += y * quad.value * alpha / l;
                }
                return true;
            }

            // Otherwise, process points directly.
            else if (quad.length || l >= distanceMax2) return;

            // Limit forces for very close nodes; randomize direction if coincident.
            if (quad.data !== node || quad.next) {
                if (x === 0) x = jiggle(), l += x * x;
                if (y === 0) y = jiggle(), l += y * y;
                if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
            }

            do if (quad.data !== node) {
                w = strengths[quad.data.index] * alpha / l;
                node.vx += x * w;
                node.vy += y * w;
            } while (quad = quad.next);
        }

        force.iterations = function (_) {
            return arguments.length ? (iterations = +_, force) : iterations;
        };

        force.initialize = function (_) {
            n = (nodes = _).length;
            initialize();
        };

        force.distanceMin = function (_) {
            return arguments.length ? (distanceMin2 = _ * _, force) : Math.sqrt(distanceMin2);
        };

        force.distanceMax = function (_) {
            return arguments.length ? (distanceMax2 = _ * _, force) : Math.sqrt(distanceMax2);
        };

        force.strength = function (_) {
            return arguments.length ? (strength = typeof _ === "function" ? _ : constant(+_), initialize(), force) : strength;
        };
        return force;
    }

    // custom force of polygon collision
    // inspired from http://bl.ocks.org/larsenmtl/39a028da44db9e8daf14578cb354b5cb
    function forceCollidePolygon(polygon, radius) {
        var nodes, n, iterations = 1;

        // took from d3-force/src/collide.js
        if (typeof radius !== "function") radius = constant(radius == null ? 1 : +radius);

        function force() {
            for (let l = 0; l < iterations; l++) {
                for (let k = 0; k < nodes.length; k++) {
                    let node = nodes[k],
                        point = {x: node.x, y: node.y},
                        polyPoints = polygon.vertices,
                        center = polygon.center,
                        radius = node.radius,
                        inter = false,
                        vectors = [],
                        distances = [],
                        minDistance = 0,
                        indexOfNearestSegment = 0;

                    // we loop over polygon's edges to check collisions
                    for (let j = 0; j < polyPoints.length; j++) {
                        let n = (j + 1) < polyPoints.length ? (j + 1) : 0;
                        let segment1 = {x: polyPoints[j][0], y: polyPoints[j][1]};
                        let segment2 = {x: polyPoints[n][0], y: polyPoints[n][1]};
                        let vector = point2Segment(point, segment1, segment2);
                        let d = dist2Segment(point, vector);

                        vectors.push(vector);
                        distances.push(d);
                        minDistance = Math.min(...distances);
                        indexOfNearestSegment = distances.indexOf(minDistance);

                        // set min distance between the point and its nearest polygon segment
                        if (d < 20) {
                            let dvx = Math.abs(point.x - vector.x) / (d);
                            let dvy = Math.abs(point.y - vector.y) / (d);
                            node.vx += Math.sign(point.x - vector.x) * dvx;
                            node.vy += Math.sign(point.y - vector.y) * dvy;
                        }

                        // boundary detection
                        if (minDistance <= radius) {
                            let dvx = Math.abs(point.x - vectors[indexOfNearestSegment].x) / (minDistance);
                            let dvy = Math.abs(point.y - vectors[indexOfNearestSegment].y) / (minDistance);
                            node.vx = 0;
                            node.vy = 0;
                            node.vx += Math.sign(point.x - vectors[indexOfNearestSegment].x) * dvx;
                            node.vy += Math.sign(point.y - vectors[indexOfNearestSegment].y) * dvy;
                        }

                        // check whether point is intersecting with polygon bounds
                        inter = getLineIntersection(segment1.x, segment1.y, segment2.x, segment2.y, center.x, center.y, point.x, point.y);
                        if (inter) {
                            node.x = inter.x;
                            node.y = inter.y;
                            break;
                        }
                    }

                    // set point orientation
                    let nearestSegment = {
                        p1: polyPoints[indexOfNearestSegment] || polyPoints[0],
                        p2: polyPoints[indexOfNearestSegment + 1] || polyPoints[0]
                    };
                    node.orientation = Math.atan2(nearestSegment.p2[1] - nearestSegment.p1[1], nearestSegment.p2[0] - nearestSegment.p1[0]);
                }
            }
            return;
        }

        force.iterations = function (_) {
            return arguments.length ? (iterations = +_, force) : iterations;
        };

        force.initialize = function (_) {
            n = (nodes = _).length;
        };

        force.radius = function (_) {
            return arguments.length ? (radius = typeof _ === "function" ? _ : constant(+_), force) : radius;
        };

        return force;
    }

    // source: http://stackoverflow.com/questions/563198/how-do-you-detect-where-two-line-segments-intersect
    function getLineIntersection(p0_x, p0_y, p1_x, p1_y, p2_x, p2_y, p3_x, p3_y) {
        var s1_x, s1_y, s2_x, s2_y;
        s1_x = p1_x - p0_x;
        s1_y = p1_y - p0_y;
        s2_x = p3_x - p2_x;
        s2_y = p3_y - p2_y;
        var s, t;
        s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
        t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);
        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
            var intX = p0_x + (t * s1_x);
            var intY = p0_y + (t * s1_y);
            return {
                x: intX,
                y: intY
            };
        }
        return false;
    }

    // took from d3-force/src/jiggle.js
    function jiggle() {
        // return (Math.random() - 0.5) * 1e-6;
        return 0;
    }

    // took from d3-force/src/constant.js
    function constant(x) {
        return function () {
            return x;
        };
    }

    function distance(v, w) {
        return Math.sqrt(dist2(v, w));
    }

    function sqr(x) {
        return x * x;
    }

    function dist2(v, w) {
        return sqr(v.x - w.x) + sqr(v.y - w.y);
    }

    function point2Segment(p, v, w) {
        let l2 = dist2(v, w);

        if (l2 === 0) return dist2(p, v);

        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;

        if (t < 0) return v;
        if (t > 1) return w;

        return {x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y)};
    }

    function dist2Segment(point, vector) {
        return Math.sqrt(dist2(point, vector));
    }

    function cellHalfedgeStart(cell, edge) {
        return edge[+(edge.left !== cell.site)];
    }

    // get bounds of a specific polygon
    function bounds(polygon) {
        let xs = polygon.map(p => p[0]),
            ys = polygon.map(p => p[1]),
            minX = Math.min.apply(null, xs),
            maxX = Math.max.apply(null, xs),
            minY = Math.min.apply(null, ys),
            maxY = Math.max.apply(null, ys);
        return {width: maxX - minX, height: maxY - minY};
    }

    /*=====================================================================================================
                                             Drag Functions
    ======================================================================================================*/
    function dragsubject() {
        let sbj, index, isInside;
        let x = state.transform.invertX(d3.event.x);
        let y = state.transform.invertY(d3.event.y);

        if (!state.isWarpMode) {
            // DRAGGED_SUBJECT = building
            for (let i = 0; i < state.graphics.polygons.length; i++) {
                let point = [x, y];

                isInside = d3.polygonContains(state.graphics.polygons[i].vertices, point);
                if (isInside) {
                    index = i;
                    break;
                }
            }
            try {
                sbj = state.simulations[index].find(x, y);
            } catch {
            }

        } else {
            // DRAGGED_SUBJECT = vertex
            try {
                let vertex = findVertex(x, y);
                let edge = state.graphics.edges[vertex.index];

                if (vertex.x === edge[0][0] && vertex.y === edge[0][1]) {
                    sbj = state.graphics.edges[vertex.index][0];
                } else if (vertex.x === edge[1][0] && vertex.y === edge[1][1]) {
                    sbj = state.graphics.edges[vertex.index][1];
                } else {
                    console.log("no sbj");
                }
            } catch {
            }
        }
        state.DRAGGED_SUBJECT = sbj || null;
        console.log("DRAGGED_SUBJECT: ", state.DRAGGED_SUBJECT);

        if (!state.DRAGGED_SUBJECT) d3.contextMenu('close');

        return state.DRAGGED_SUBJECT;
    }

    function dragstarted() {
        if (!state.isWarpMode) {
            // dragging building
            d3.contextMenu('close');
            if (!state.isDragSelected) {
                state.simulations[d3.event.subject.parent]
                    .force("center", d3.forceCenter(d3.event.x, d3.event.y))
                    .restart();
            }
            if (!d3.event.active) state.simulations[d3.event.subject.parent].alphaTarget(0.3).restart();
            makePointInside();
        } else {
            // dragging vertex
        }
    }

    function dragged() {
        let x = d3.event.x;
        let y = d3.event.y;

        if (!state.isWarpMode) {
            // dragging building
            if (!state.isDragSelected) {
                state.simulations[d3.event.subject.parent]
                    .force("center", d3.forceCenter(x, y))
                    .restart();
            }
            makePointInside();
            tick();
        } else {
            if (x > 20 && x < state.width() - 20 && y > 20 && y < state.height() - 20) {
                d3.event.subject[0] = x;
                d3.event.subject[1] = y;
                d3.event.subject.x = x;
                d3.event.subject.y = y;
                drawVertices();
            }
        }
    }

    function dragended() {
        if (!state.isWarpMode) {
            // dragging building
            if (!d3.event.active) state.simulations[d3.event.subject.parent].alphaTarget(0).stop();
            d3.event.subject.fx = null;
            d3.event.subject.fy = null;
            state.DRAGGED_SUBJECT = null;
            tick();
        } else {
            // dragging vertex
            $('#stopWarp').click();
            $('#startWarp').click();
            state.DRAGGED_SUBJECT = null;
        }
    }

    function makePointInside() {
        let poly = state.graphics.polygons[d3.event.subject.parent];
        let center = poly.center;
        let polyPoints = poly.vertices;

        for (let j = 0; j < polyPoints.length; j++) {
            let n = (j + 1) < polyPoints.length ? (j + 1) : 0;
            let segment1 = {x: polyPoints[j][0], y: polyPoints[j][1]};
            let segment2 = {x: polyPoints[n][0], y: polyPoints[n][1]};
            // check whether point is intersecting with polygon bounds
            let inter = getLineIntersection(segment1.x, segment1.y, segment2.x, segment2.y, center.x, center.y, d3.event.x, d3.event.y);
            if (inter) {
                d3.event.subject.fx = inter.x;
                d3.event.subject.fy = inter.y;
                break;
            } else {
                d3.event.subject.fx = d3.event.x;
                d3.event.subject.fy = d3.event.y;
            }
        }
    }

    function findVertex(x, y, radius) {
        var i = 0,
            n = state.vertices.length,
            dx,
            dy,
            d2,
            vertex,
            closest;

        if (radius == null) radius = Infinity;
        else radius *= radius;

        for (i = 0; i < n; ++i) {
            vertex = state.vertices[i];
            dx = x - vertex.x;
            dy = y - vertex.y;
            d2 = dx * dx + dy * dy;
            if (d2 < radius) closest = vertex, radius = d2;
        }
        return closest;
    }

    /*=====================================================================================================
                                             Draw Functions
    ======================================================================================================*/
    // https://codeplea.com/triangular-interpolation
    //
    function barycentricValue(triangle, point) {

        return 'white';
    }

    // render background
    function renderBackground() {
        state.context().save();
        state.context().translate(state.transform.x, state.transform.y);
        state.context().scale(state.transform.k, state.transform.k);

        state.graphics.triangles.forEach(triangle => {
            let min_width = Math.min(triangle[0][0], triangle[1][0], triangle[2][0]);
            let max_width = Math.max(triangle[0][0], triangle[1][0], triangle[2][0]);
            let min_height = Math.min(triangle[0][1], triangle[1][1], triangle[2][1]);
            let max_height = Math.max(triangle[0][1], triangle[1][1], triangle[2][1]);

            for (let x = min_width; x < max_width; x++) {
                for (let y = min_height; y < max_height; y++) {
                    let point = [x, y];
                    if (d3.polygonContains(triangle, point)) {
                        let color = barycentricValue(triangle, point);

                        state.context().beginPath();
                        state.context().fillStyle = color;
                        state.context().fillRect(x, y, 1, 1);
                    }
                }
            }
        });
        state.context().restore();
    }

    // draw sites
    function drawSites() {
        state.context().save();
        state.context().translate(state.transform.x, state.transform.y);
        state.context().scale(state.transform.k, state.transform.k);

        for (let i = 0, n = state.graphics.polygons.length; i < n; ++i) {
            let site = state.graphics.polygons[i].site;
            state.context().beginPath();
            state.context().moveTo(site.x + 8, site.y);
            state.context().arc(site.x, site.y, 8, 0, 2 * Math.PI, false);
            state.context().fillStyle = site.color;
            state.context().fill();
            state.context().strokeStyle = site.color;
            state.context().stroke();
        }
        state.context().restore();
    }

    // draw centers
    function drawCenters(color) {
        state.context().save();
        state.context().translate(state.transform.x, state.transform.y);
        state.context().scale(state.transform.k, state.transform.k);

        for (let i = 0, n = state.graphics.polygons.length; i < n; ++i) {
            let site = state.graphics.polygons[i].center;
            state.context().beginPath();
            state.context().moveTo(site.x + 2.5, site.y);
            state.context().arc(site.x, site.y, 2.5, 0, 2 * Math.PI, false);
            state.context().fillStyle = color;
            state.context().fill();
            state.context().strokeStyle = color;
            state.context().stroke();
        }
        state.context().restore();
    }

    // draw links among sites
    function drawLink() {
        state.context().save();
        state.context().beginPath();
        state.context().translate(state.transform.x, state.transform.y);
        state.context().scale(state.transform.k, state.transform.k);

        for (let i = 0, n = state.graphics.links.length; i < n; ++i) {
            let link = state.graphics.links[i];
            state.context().moveTo(link.source[0], link.source[1]);
            state.context().lineTo(link.target[0], link.target[1]);
        }
        state.context().strokeStyle = "rgba(0,0,0,0.2)";
        state.context().stroke();
        state.context().restore();
    }

    // draw triangles
    function drawTriangles() {
        for (let i = 0, n = state.graphics.triangles.length; i < n; ++i) {
            let triangle = state.graphics.triangles[i];
            state.context().save();
            state.context().beginPath();
            state.context().translate(state.transform.x, state.transform.y);
            state.context().scale(state.transform.k, state.transform.k);
            state.context().moveTo(triangle[0][0] + 8, triangle[0][1]);
            state.context().lineTo(triangle[1][0], triangle[1][1]);
            state.context().lineTo(triangle[2][0], triangle[2][1]);
            state.context().closePath();
            state.context().strokeStyle = "rgba(0,0,0,0.2)";
            state.context().stroke();
            // state.context().beginPath();
            // state.context().moveTo(triangle[0][0] + 8, triangle[0][1]);
            // state.context().arc(triangle[0][0], triangle[0][1], 8, 0, 2 * Math.PI);
            // state.context().fillStyle = triangle[0].color;
            // state.context().fill();
            // state.context().closePath();
            // state.context().beginPath();
            // state.context().moveTo(triangle[1][0] + 8, triangle[1][1]);
            // state.context().arc(triangle[1][0], triangle[1][1], 8, 0, 2 * Math.PI);
            // state.context().fillStyle = triangle[1].color;
            // state.context().fill();
            // state.context().closePath();
            state.context().restore();
        }
    }

    // draw vertices
    function drawVertices() {
        // clear rendered edges & vertices first
        tick();

        // draw edges & vertices
        state.graphics.edges.forEach(e => {
            state.context().save();
            state.context().beginPath();
            state.context().translate(state.transform.x, state.transform.y);
            state.context().scale(state.transform.k, state.transform.k);
            state.context().moveTo(e[0][0], e[0][1]);
            state.context().lineTo(e[1][0], e[1][1]);
            state.context().lineWidth = 1;
            state.context().strokeStyle = 'red';
            state.context().stroke();
            state.context().closePath();

            state.context().beginPath();
            state.context().moveTo(e[0][0] + 8, e[0][1]);
            state.context().arc(e[0][0], e[0][1], 8, 0, 2 * Math.PI);
            state.context().lineWidth = 2;
            state.context().strokeStyle = 'red';
            state.context().stroke();
            state.context().fillStyle = '#CBC5B9';
            state.context().fill();
            state.context().restore();
        });

        // draw DRAGGED_SUBJECT vertex
        if (state.DRAGGED_SUBJECT) {
            let d = state.DRAGGED_SUBJECT;
            state.context().save();
            state.context().beginPath();
            state.context().translate(state.transform.x, state.transform.y);
            state.context().scale(state.transform.k, state.transform.k);
            state.context().moveTo(d.x + 8, d.y);
            state.context().arc(d.x, d.y, 8, 0, 2 * Math.PI);
            state.context().lineWidth = 2;
            state.context().strokeStyle = 'red';
            state.context().stroke();
            state.context().fillStyle = 'red';
            state.context().fill();
            state.context().restore();
        }
    }

    // draw edges
    function drawEdges(width, color) {
        for (let i = 0; i < state.graphics.edges.length; i++) {
            let edge = state.graphics.edges[i];
            if (edge && edge[0] && edge[1]) {
                if (edge.left && state.graphics.polygons[edge.left.index].children.length !== 0) {
                    drawPath(edge[0], edge[1], width, color);
                } else if (edge.right && state.graphics.polygons[edge.right.index].children.length !== 0) {
                    drawPath(edge[0], edge[1], width, color);
                } else if (edge.left && edge.right && state.graphics.polygons[edge.left.index].children.length !== 0 && state.graphics.polygons[edge.right.index].children.length !== 0) {
                    drawPath(edge[0], edge[1], width, color);
                }
            }
        }
    }

    // draw segment
    function drawPath(v1, v2, width, color) {
        let count = 0;
        const DISTANCE = $('#distance').val() || 100;
        const PATH_LENGTH = distance(v1, v2);
        const SEGMENT = $('#segment').val() || 20;
        const SEGMENT_LENGTH = PATH_LENGTH / SEGMENT;

        state.context().save();
        state.context().beginPath();
        state.context().translate(state.transform.x, state.transform.y);
        state.context().scale(state.transform.k, state.transform.k);

        while (distance(v1, v2) > SEGMENT_LENGTH * 1.2 && count++ < 20) {
            let points = itemsWithin(state.graphics.buildings, v1, DISTANCE);
            let vectors = points.map(point => {
                let diff = {x: v1.x - point.x, y: v1.y - point.y};

                diff = toPolar(diff);
                diff.r = Math.max(.05, diff.r - point.radius);
                return toCartesian(diff);
            });

            let f = (vPolar) => {
                vPolar.r = DISTANCE / vPolar.r;
                return vPolar;
            };

            // get Vsum: the sum of building vectors.  Each building pushes v1 away from itself
            let vSum = setLength(getSumOfVectors(vectors, f), 0.5);
            let vPull = setLength({x: v2.x - v1.x, y: v2.y - v1.y}, 1);

            // add a pulling vector from v1 to v2
            vSum.x += vPull.x;
            vSum.y += vPull.y;
            vSum = setLength(vSum, SEGMENT_LENGTH);

            let vTemp = {x: v1.x + vSum.x, y: v1.y + vSum.y};

            // draw line form v1 to vTemp
            state.context().moveTo(v1.x, v1.y);
            state.context().lineTo(vTemp.x, vTemp.y);

            v1 = vTemp;
        }
        // draw line form v1 to v2
        state.context().moveTo(v1.x, v1.y);
        state.context().lineTo(v2.x, v2.y);
        state.context().lineWidth = width
        state.context().strokeStyle = color;
        state.context().stroke();
        state.context().restore();
    }

    function isIn(item, center, boxDimension) {
        let dx = Math.abs(item.x - center.x);
        let dy = Math.abs(item.y - center.y);
        return dx <= boxDimension && dy <= boxDimension;
    }

    function itemsWithin(items, center, distance) {
        return items.filter(item => isIn(item, center, distance));
    }

    // polar(r, theta) to Cartesian(x, y)
    function toPolar(v) {
        return {
            r: Math.sqrt(v.x * v.x + v.y * v.y),
            theta: Math.atan2(v.y, v.x)
        }
    }

    // Cartesian(x, y) to polar(r, theta)
    function toCartesian(p) {
        return {
            x: p.r * Math.cos(p.theta),
            y: p.r * Math.sin(p.theta)
        }
    }

    function setLength(v, length) {
        let polar = toPolar(v);

        polar.r = length;
        return toCartesian(polar);
    }

    // get sum of vectors
    function getSumOfVectors(vectors, f) {
        let vX = 0;
        let vY = 0;
        for (v of vectors) {
            let temp = toPolar(v);
            let tempV = f(temp);
            temp = toCartesian(tempV);
            vX += temp.x;
            vY += temp.y;
        }
        return {x: vX, y: vY};
    }

    /*=====================================================================================================
                                            onKey Functions
    ======================================================================================================*/
    function onKeyDown() {
        if (d3.event.keyCode === 13) {
            if ($('#sites').val() !== "") {
                newGraphics();
            }
        }
    }

    // return state, mainly state.graphics
    return state;
}