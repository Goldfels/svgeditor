'use strict';

$.widget( ".svgedit", {

	_svg: null, 					       // svg image field
	_selected: null,                       // currently selected svg
	_tool: null, 						   // currently used tool
	_lastColor: null, 					   // color for the paint tool
	_undoArray: [], 					   // array for all the undos
	_undoPos: 0, 						   // position of undo in undoArray
	_source: null, 					       // source code of svg image
	_downloadlink: null,                   // link used to download svg
	_movement: 0,                          // what movement is the svg doing
	_offset: { x: 0, y: 0 },               // position of the selection
	_transformOffset: null,                // transformations after click
	_rectOffset: null,                     // bounding rectangle after click
	MovementCode: { None: 0,               // movement codes
					Moving: 1,
					TopLeft: 2,
					TopRight: 3,
					BottomLeft: 4,
					BottomRight: 5,
					Rotate: 6,
					},

	// Control options
	// Currently unused
    options: {
        breadth: 250,       // panel width or height depending on where its docked
        curve:10,           // the curve of the handle
        disabled:false,     // panel shuts and won't open any more
        dock: "left",       // default to left
        hidden:false,       // panel and grab handle is hidden
        opacity: 1,         // slide in panel opacity
        open: true,         // true is open, false is closed
        peek: 10,           // how far the panel peeks into the main window
        position:10,        // percentage position of the handle, 0 = top, 50 = middle, 100 = bottom
        prompt: "",         // text to show in the grab handle
        speed: 400,         // animate speed for opening and closing in millisecs
        toOpen: "click",    // what actions open the panel
        toClose: "click"    // what actions close the panel
    },

    // one time control initialization
    _create: function () {
		var self = this;
		var drag = d3.drag();

		// Default to the move tool
		self._tool = "move";

		this._svg = this.element;
		this._prepSVGfield();

		// Hidden download link for saving
		this._downloadlink = $('<a>', {
			style: 'display: none;',
		}).appendTo('body');

		// Event on dragging start
		d3.select(this._svg.context).call(drag.on("start", function() {
			// Only move with the move tool
			if(self._tool == "move") {
				// Are we touching or using the mouse?
				if(d3.event.sourceEvent.type == "touchstart") {
					self._reposition(d3.event.sourceEvent.changedTouches[0]);
				} else {
					self._reposition(d3.event.sourceEvent);
				}
			} else if(self._tool == "paint") {
				self._paint(d3.event.sourceEvent);
			}
		}));

		// Event on dragging stop
		d3.select(this._svg.context).call(drag.on("end", function() {
			if(self._tool == "move") {
				self._stopmoving();
			}
		}));

		// Event on dragging
		d3.select(this._svg.context).call(drag.on("drag", function() {
			if(self._tool == "move") {
				// Are we touching or using the mouse?
				if(d3.event.sourceEvent.type == "touchmove") {
					self._movesvg(d3.event.sourceEvent.changedTouches[0]);
				} else {
					self._movesvg(d3.event.sourceEvent);
				}
			}
		}));

		$(this._svg).dblclick(function(event) {
			if(self._tool == "move") {
				self._duplicate(event);
			}
		});
    },

    // destructor called on element deletion
    _destroy: function () {
    },

    // set the control options
	// Currently unused
    _setOption: function ( key, value ) {

        var self = this;

        var handlers = {
            "breadth": function () { self.breadth( value ); },
            "curve": function () { self.curve( value ); },
            "disabled": function () { self.disabled( value ); },
            "dock": function () { self.dock( value ); },
            "hidden": function () { self.hidden( value ); },
            "opacity": function () { self.opacity( value ); },
            "open": function () { self.open( value ); },
            "peek": function () { self.peek( value ); },
            "position": function () { self.position( value ); },
            "prompt": function () { self.prompt( value ); },
            "speed": function () { self.speed( value ); },
            "toOpen": function () { self.toOpen( value ); },
            "toClose": function () { self.toClose( value ); }
        };

        if ( key in handlers ) {
            handlers[key]();
        }

        this._super( key, value ); // base handler
    },

	// add element
	// TODO: kinda ugly
	
	addElement: function(element) {
		//this._svg.append(element);
		//console.log($(element));
		var added = d3.select(this._svg.context)
			.append('g').attr('class', 'addedsvg');
			//.append( $(element).clone()[0] );
		$(added._groups[0][0]).append($(element).clone());
		this._createCheckpoint();
	},

	// change content
	setContent: function(content) {
		this._svg.context.innerHTML = content.documentElement.innerHTML;
	},

	// clear everything
	clear: function() {
		this._svg.context.textContent = '';
		this._prepSVGfield();
		this._createCheckpoint();
	},

	// save png
	save: function() {
		// Remove controls if present
		d3.select(this._svg.context).select('.svgcontrols').remove();

		const canvas = document.querySelector('#canv');
		const ctx = canvas.getContext('2d');
    
		// Render svg to canvas
		var v = canvg.Canvg.fromString(ctx, this.toString());
		v.start();
		// Convert canvas to base64 encoded png
		var img = canvas.toDataURL("image/png");

		// Click hidden download link
		this._downloadlink[0].href = img;
		this._downloadlink[0].download = title.value + '.png';
		this._downloadlink[0].click();
	},

	// Change selected object color
	changeColor: function(color) {
		this._lastColor = color;
		if(this._selected == null) return;
		this._selected[0].style.fill = color;
		this._createCheckpoint();
	},

	undo: function() {
		// Check if we can undo
		if(this._undoPos == 1) return;
		this._undoPos -= 1;
		this._svg.context.innerHTML = this._undoArray[this._undoPos - 1];
	},

	redo: function() {
		// Check if we can redo
		if(this._undoPos == this._undoArray.length) return;
		this._undoPos += 1;
		this._svg.context.innerHTML = this._undoArray[this._undoPos - 1];
	},

	// Convert current image to svg
	// TODO: custom width and height

	toString: function() {
		return [
			'<?xml version="1.0" encoding="UTF-8"?>\n',
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">\n',
			this._svg.context.innerHTML,
			'</svg>'
		].join( '' );
	},

    // repositions the panel in the light of css or other visual changes
    refresh: function () {
        this._reposition();
    },

	changeTool: function(tool) {
		// Deselect
		this._selected = null;
		this._updateSelection(this._svg.context);

		this._tool = tool;
	},

	// Move selected object
    _reposition: function (event) {

		this._movement = this.MovementCode.Moving;
		var target = $(event.target).parents(".addedsvg");

		// TODO: collect them to svg-scale class

		if( $(event.target).hasClass('svg-scale-bottomright') ) {
			this._movement = this.MovementCode.BottomRight;
			this._offset.x = event.clientX;
			this._offset.y = event.clientY;
			this._transformOffset = this._getTransformations( $(this._selected).attr('transform') );
			return;
		}

		if( $(event.target).hasClass('svg-scale-bottomleft') ) {
			this._movement = this.MovementCode.BottomLeft;
			this._offset.x = event.clientX;
			this._offset.y = event.clientY;
			this._transformOffset = this._getTransformations( $(this._selected).attr('transform') );
			return;
		}

		if( $(event.target).hasClass('svg-scale-topright') ) {
			this._movement = this.MovementCode.TopRight;
			this._offset.x = event.clientX;
			this._offset.y = event.clientY;
			this._transformOffset = this._getTransformations( $(this._selected).attr('transform') );
			return;
		}

		if( $(event.target).hasClass('svg-scale-topleft') ) {
			this._movement = this.MovementCode.TopLeft;
			this._offset.x = event.clientX;
			this._offset.y = event.clientY;
			this._transformOffset = this._getTransformations( $(this._selected).attr('transform') );
			return;
		}

		if( $(event.target).hasClass('svg-rotate') ) {
			this._movement = this.MovementCode.Rotate;
			this._offset.x = event.clientX;
			this._offset.y = event.clientY;
			this._transformOffset = this._getTransformations( $(this._selected).attr('transform') );
			this._rectOffset = this._selected[0].getBoundingClientRect();

			// if image is rotated, the image will need offsetting
			// TODO: center point still not quite consistent
			// a*b = abs(a)*abs(b)*cos(alpha)
			var alpha = this._transformOffset.rotate * Math.PI / 180;
			var x = this._rectOffset.width/2;
			var y = this._rectOffset.height/2;
			var e = -Math.cos(alpha)*x + Math.sin(alpha)*y + x;
			var f = -Math.sin(alpha)*x - Math.cos(alpha)*y + y;
			this._transformOffset.translateX -= e;
			this._transformOffset.translateY -= f;

			var self = this;
			d3.select('.svgcontrols')
				.attr('transform', function() {
					return [
						'translate(', self._transformOffset.translateX, ', ', self._transformOffset.translateY, ') ',
						'rotate(', self._transformOffset.rotate, ', ', x, ', ', y, ') ',
						//'scale(', transform.scaleX, ', ', transform.scaleY, ')',
					].join('');
				});
			d3.select(this._selected[0])
				.attr('transform', function() {
					return [
						'translate(', self._transformOffset.translateX, ', ', self._transformOffset.translateY, ') ',
						'rotate(', self._transformOffset.rotate, ', ', x, ', ', y, ') ',
						'scale(', self._transformOffset.scaleX, ', ', self._transformOffset.scaleY, ')',
					].join('');
				});

			return;
		}

		if ( target.context.isSameNode( this._svg.context ) === false ) {

			// When moving object again, reset transformations
			var transform_text = $(target).attr('transform');
			if(transform_text == null) {
				// If there is no transformation, set defaults
				$(target).attr("transform", function() {
					return [
						'translate(0, 0) ',
						'rotate(0) ',
						'scale(1, 1)',
					].join('');
				});
				var firstX = 0, firstY = 0;
			} else {
				var transform = this._getTransformations(transform_text);
				$(target).attr("transform", function() {
					return [
						'translate(', transform.translateX, ', ', transform.translateY, ') ',
						'rotate(', transform.rotate, ') ',
						'scale(', transform.scaleX, ', ', transform.scaleY, ')',
					].join('');
				});

				var firstX = transform.translateX,
					firstY = transform.translateY;
			}

			this._offset.x = parseFloat( firstX ) - event.clientX;
			this._offset.y = parseFloat( firstY ) - event.clientY;


			this._selected = target;
			this._updateSelection( target[0] );

		} else {
			// Deselect
			this._selected = null;

			this._updateSelection(target.context);
		}
    },

	// Select
	_updateSelection: function(element) {

		if ( element.isSameNode( this._svg.context ) ) {

			d3.select(this._svg.context).select('.svgcontrols').remove();
			return;

		}

		// If we have no controls, add them
		if( $(this._svg).find('.svgcontrols').length < 1) {
			var transform = this._getTransformations( $(element).attr('transform') );
			var rect = element.getBBox();
			rect.width *= transform.scaleX;
			rect.height *= transform.scaleY;
			var controls = 	d3.select(this._svg.context).append('g')
				.attr('class', 'svgcontrols')
				.attr('transform', function() {
					return [
						'translate(', transform.translateX, ', ', transform.translateY, ') ',
						'rotate(', transform.rotate, ') ',
						//'scale(', transform.scaleX, ', ', transform.scaleY, ')',
					].join('');
				});
			controls.append('rect')
				.attr('class', 'svgboundrect')
				.attr('x', -10)
				.attr('y', -10)
				.attr('width', rect.width + 20)
				.attr('height', rect.height + 20)
				.attr('style', 'stroke: #09dae2; fill-opacity: 0; pointer-events: none;');
			controls.append('circle')
				.attr('class', 'svg-scale-topleft')
				.attr('r', 7)
				.attr('cx', -10)
				.attr('cy', -10)
				.attr('style', 'fill: white; stroke: lightgrey;');
			controls.append('circle')
				.attr('class', 'svg-scale-topright')
				.attr('r', 7)
				.attr('cx', rect.width + 10)
				.attr('cy', -10)
				.attr('style', 'fill: white; stroke: lightgrey;');
			controls.append('circle')
				.attr('class', 'svg-scale-bottomleft')
				.attr('r', 7)
				.attr('cx', -10)
				.attr('cy', rect.height + 10)
				.attr('style', 'fill: white; stroke: lightgrey;');
			controls.append('circle')
				.attr('class', 'svg-scale-bottomright')
				.attr('r', 7)
				.attr('cx', rect.width + 10)
				.attr('cy', rect.height + 10)
				.attr('style', 'fill: white; stroke: lightgrey;');
			//controls.append('circle')
			//	.attr('class', 'svg-rotate')
			//	.attr('r', 7)
			//	.attr('cx', rect.width/2)
			//	.attr('cy', rect.height + 30)
			//	.attr('style', 'fill: white; stroke: lightgrey;');
			controls.append('use')
				.attr('class', 'svg-rotate')
				.attr('xlink:href', '#rotatecircle')
				.attr('x', rect.width/2)
				.attr('y', rect.height + 30);
		} else {
			var transform = this._getTransformations( $(element).attr('transform') );
			var rect = element.getBBox();
			rect.width *= transform.scaleX;
			rect.height *= transform.scaleY;
			var controls = d3.select('.svgcontrols')
				.attr('transform', function() {
					return [
						'translate(', transform.translateX, ', ', transform.translateY, ') ',
						'rotate(', transform.rotate, ') ',
						//'scale(', transform.scaleX, ', ', transform.scaleY, ')',
					].join('');
				});
			controls.select('.svgboundrect')
				.attr('width', rect.width + 20)
				.attr('height', rect.height + 20);
			controls.select('.svg-scale-topright')
				.attr('cx', rect.width + 10);
			controls.select('.svg-scale-bottomleft')
				.attr('cy', rect.height + 10);
			controls.select('.svg-scale-bottomright')
				.attr('cx', rect.width + 10)
				.attr('cy', rect.height + 10);
			controls.select('.svg-rotate')
				.attr('x', rect.width/2)
				.attr('y', rect.height + 30);
		}
	},

	// Handle scaling and rotation of controls and currently selected object
	_movesvg: function(event) {
		if(this._movement == this.MovementCode.BottomRight) {
			var transform = this._getTransformations( this._selected.attr('transform') );
			var rect = this._selected[0].getBBox();

			// Matrix rotation, if svg is rotated
			var alpha = -transform.rotate / 180 * Math.PI;
			var x = (event.clientX - this._offset.x)*Math.cos(alpha) - (event.clientY - this._offset.y)*Math.sin(alpha);
			var y = (event.clientX - this._offset.x)*Math.sin(alpha) + (event.clientY - this._offset.y)*Math.cos(alpha);
			this._selected[0].transform.baseVal.getItem(2).setScale(
				this._transformOffset.scaleX + x/rect.width,
				this._transformOffset.scaleY + y/rect.height );

			rect.width *= transform.scaleX;
			rect.height *= transform.scaleY;

			var controls = d3.select('.svgcontrols');
			controls.select('.svgboundrect')
				.attr('width', rect.width + 20)
				.attr('height', rect.height + 20);
			controls.select('.svg-scale-topright')
				.attr('cx', rect.width + 10);
			controls.select('.svg-scale-bottomleft')
				.attr('cy', rect.height + 10);
			controls.select('.svg-scale-bottomright')
				.attr('cx', rect.width + 10)
				.attr('cy', rect.height + 10);
			controls.select('.svg-rotate')
				.attr('x', rect.width/2)
				.attr('y', rect.height + 30);

		} else if(this._movement == this.MovementCode.BottomLeft) {

			var rect = this._selected[0].getBBox();
			var transform = this._getTransformations( this._selected.attr('transform') );

			var alpha = -transform.rotate / 180 * Math.PI;
			var x = (event.clientX - this._offset.x)*Math.cos(alpha) - (event.clientY - this._offset.y)*Math.sin(alpha);
			var y = (event.clientX - this._offset.x)*Math.sin(alpha) + (event.clientY - this._offset.y)*Math.cos(alpha);
			this._selected[0].transform.baseVal.getItem(2).setScale(
				this._transformOffset.scaleX - x/rect.width,
				this._transformOffset.scaleY + y/rect.height );
			y = x*Math.sin(-alpha);
			x = x*Math.cos(-alpha);
			this._selected[0].transform.baseVal.getItem(0).setTranslate(this._transformOffset.translateX + x, this._transformOffset.translateY + y);
			var rect = this._selected[0].getBBox();

			rect.width *= transform.scaleX;
			rect.height *= transform.scaleY;

			var controls = d3.select('.svgcontrols')
				.attr('transform', function() {
					return [
						'translate(', transform.translateX, ', ', transform.translateY, ') ',
						'rotate(', transform.rotate, ') ',
						//'scale(', transform.scaleX, ', ', transform.scaleY, ')',
					].join('');
				});
			controls.select('.svgboundrect')
				.attr('width', rect.width + 20)
				.attr('height', rect.height + 20);
			controls.select('.svg-scale-topright')
				.attr('cx', rect.width + 10);
			controls.select('.svg-scale-bottomleft')
				.attr('cy', rect.height + 10);
			controls.select('.svg-scale-bottomright')
				.attr('cx', rect.width + 10)
				.attr('cy', rect.height + 10);
			controls.select('.svg-rotate')
				.attr('x', rect.width/2)
				.attr('y', rect.height + 30);

		} else if(this._movement == this.MovementCode.TopRight) {

			var rect = this._selected[0].getBBox();
			var transform = this._getTransformations( this._selected.attr('transform') );

			var alpha = -transform.rotate / 180 * Math.PI;
			var x = (event.clientX - this._offset.x)*Math.cos(alpha) - (event.clientY - this._offset.y)*Math.sin(alpha);
			var y = (event.clientX - this._offset.x)*Math.sin(alpha) + (event.clientY - this._offset.y)*Math.cos(alpha);
			this._selected[0].transform.baseVal.getItem(2).setScale(
				this._transformOffset.scaleX + x/rect.width,
				this._transformOffset.scaleY - y/rect.height );
			x = -y*Math.sin(-alpha);
			y = y*Math.cos(-alpha);
			this._selected[0].transform.baseVal.getItem(0).setTranslate(this._transformOffset.translateX + x, this._transformOffset.translateY + y);
			var rect = this._selected[0].getBBox();

			rect.width *= transform.scaleX;
			rect.height *= transform.scaleY;

			var controls = d3.select('.svgcontrols')
				.attr('transform', function() {
					return [
						'translate(', transform.translateX, ', ', transform.translateY, ') ',
						'rotate(', transform.rotate, ') ',
						//'scale(', transform.scaleX, ', ', transform.scaleY, ')',
					].join('');
				});
			controls.select('.svgboundrect')
				.attr('width', rect.width + 20)
				.attr('height', rect.height + 20);
			controls.select('.svg-scale-topright')
				.attr('cx', rect.width + 10);
			controls.select('.svg-scale-bottomleft')
				.attr('cy', rect.height + 10);
			controls.select('.svg-scale-bottomright')
				.attr('cx', rect.width + 10)
				.attr('cy', rect.height + 10);
			controls.select('.svg-rotate')
				.attr('x', rect.width/2)
				.attr('y', rect.height + 30);
		} else if ( this._movement == this.MovementCode.TopLeft ) {

			var rect = this._selected[0].getBBox();
			var transform = this._getTransformations( this._selected.attr('transform') );

			var alpha = -transform.rotate / 180 * Math.PI;
			var x = (event.clientX - this._offset.x)*Math.cos(alpha) - (event.clientY - this._offset.y)*Math.sin(alpha);
			var y = (event.clientX - this._offset.x)*Math.sin(alpha) + (event.clientY - this._offset.y)*Math.cos(alpha);
			this._selected[0].transform.baseVal.getItem(2).setScale(
				this._transformOffset.scaleX - x/rect.width,
				this._transformOffset.scaleY - y/rect.height );
			this._selected[0].transform.baseVal.getItem(0).setTranslate(this._transformOffset.translateX + (event.clientX - this._offset.x), this._transformOffset.translateY + (event.clientY - this._offset.y) );
			var rect = this._selected[0].getBBox();

			rect.width *= transform.scaleX;
			rect.height *= transform.scaleY;

			var controls = d3.select('.svgcontrols')
				.attr('transform', function() {
					return [
						'translate(', transform.translateX, ', ', transform.translateY, ') ',
						'rotate(', transform.rotate, ') ',
						//'scale(', transform.scaleX, ', ', transform.scaleY, ')',
					].join('');
				});
			controls.select('.svgboundrect')
				.attr('width', rect.width + 20)
				.attr('height', rect.height + 20);
			controls.select('.svg-scale-topright')
				.attr('cx', rect.width + 10);
			controls.select('.svg-scale-bottomleft')
				.attr('cy', rect.height + 10);
			controls.select('.svg-scale-bottomright')
				.attr('cx', rect.width + 10)
				.attr('cy', rect.height + 10);
			controls.select('.svg-rotate')
				.attr('x', rect.width/2)
				.attr('y', rect.height + 30);

		} else if ( this._movement == this.MovementCode.Rotate ) {
			var self = this;

			// TODO: optimize
			var a1 = this._rectOffset.x + this._rectOffset.width/2;
			var a2 = this._rectOffset.y + this._rectOffset.height/2;

			var bbox = this._selected[0].getBBox();

			var b1 = event.clientX - a1;
			var b2 = event.clientY - a2;

			// TODO: point of rotation is inconsistent
			a1 = 0;
			a2 = 50;

			// a*b = abs(a)*abs(b)*cos(alpha)
			var rotate = Math.acos((a1*b1+a2*b2)/Math.sqrt((a1*a1+a2*a2)*(b1*b1+b2*b2)))*180/Math.PI;
			//var transform = this._getTransformations( this._selected.attr('transform') );

			if(b1 < 0) {
				d3.select('.svgcontrols')._groups[0][0].transform.baseVal.getItem(1).setRotate(
					rotate, self._rectOffset.width/2, self._rectOffset.height/2 );
				this._selected[0].transform.baseVal.getItem(1).setRotate(
					rotate, self._rectOffset.width/2, self._rectOffset.height/2 );
			} else {
				d3.select('.svgcontrols')._groups[0][0].transform.baseVal.getItem(1).setRotate(
					-rotate, self._rectOffset.width/2, self._rectOffset.height/2 );
				this._selected[0].transform.baseVal.getItem(1).setRotate(
					-rotate, self._rectOffset.width/2, self._rectOffset.height/2 );
			}

		}
		// Moving the controls and svg
		// Don't ask me why the check looks like this, for some reason this._movement == This.MovementCode.Moving doesn't work
		else if ( this._selected && this._movement != this.MovementCode.None ) {
			this._selected[0].transform.baseVal.getItem(0).setTranslate( event.clientX + this._offset.x, event.clientY + this._offset.y );
			d3.select('.svgcontrols')._groups[0][0].transform.baseVal.getItem(0).setTranslate( event.clientX + this._offset.x, event.clientY + this._offset.y );

			this._updateSelection( this._selected[0] );

		}
	},

	_duplicate: function(event) {
		// Don't duplicate the background
		if ( event.target.isSameNode( this._svg.context ) ) {
			return;
		}
		var target = $(event.target).parents(".addedsvg");
		var newelement = target.clone().appendTo(this._svg);
		var transform = this._getTransformations(newelement.attr('transform'));
		newelement[0].transform.baseVal.getItem(0).setTranslate( transform.translateX + 25, transform.translateY + 25 );
		this._updateSelection(newelement[0]);
		this._createCheckpoint();
	},

	// Executes when current object gets released
	_stopmoving: function() {
		this._movement = this.MovementCode.None;
		if(this._selected) {
			var transform = this._getTransformations( $(this._selected).attr('transform') );
			$(this._selected).attr("transform", function() {
				return [
					'translate(', transform.translateX, ', ', transform.translateY, ') ',
					'rotate(', transform.rotate, ') ',
					'scale(', transform.scaleX, ', ', transform.scaleY, ')',
				].join('');
			});
		}
		this._createCheckpoint();
	},

	_createCheckpoint: function() {
		// If we did undos, we need to clear the array
		this._checkUndoArray();
		// Allow a maximum of 10 undos
		if(this._undoPos > 10) this._undoArray.shift();
		this._undoArray.push(this._svg.context.innerHTML);
		this._undoPos = this._undoArray.length;
	},

	// Check undo array for undos
	_checkUndoArray: function() {
		if(this._undoPos != this._undoArray.length) {
			while(this._undoArray.length != this._undoPos) {
				this._undoArray.pop();
			}
		}
	},

	_paint: function(event) {
		event.target.style.fill = this._lastColor;
	},

	_prepSVGfield: function() {
		this._svg.context.innerHTML = `
		<defs id="rotatedef">
			<g fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="rotatecircle">
				<circle class="svg-rotate" r="7" cx="0" cy="0" style="fill: white; stroke: lightgrey;"></circle>
				<g transform="scale(0.3, 0.3) translate(-11.5, -11.5)">
					<polyline points="23 4 23 10 17 10"></polyline>
					<polyline points="1 20 1 14 7 14"></polyline>
					<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
				</g>
			</g>
		</defs>`;
	},

	_getTransformations: function(transform) {
		// Create a dummy g for calculation purposes only. This will never
		// be appended to the DOM and will be discarded once this function
		// returns.
		var g = document.createElementNS("http://www.w3.org/2000/svg", "g");

		// Set the transform attribute to the provided string value.
		g.setAttributeNS(null, "transform", transform);

		// consolidate the SVGTransformList containing all transformations
		// to a single SVGTransform of type SVG_TRANSFORM_MATRIX and get
		// its SVGMatrix.
		var matrix = g.transform.baseVal.consolidate().matrix;

		// Below calculations are taken and adapted from the private function
		// transform/decompose.js of D3's module d3-interpolate.
		var {a, b, c, d, e, f} = matrix;   // ES6, if this doesn't work, use below assignment
		// var a=matrix.a, b=matrix.b, c=matrix.c, d=matrix.d, e=matrix.e, f=matrix.f; // ES5
		var scaleX, scaleY, skewX;
		if (scaleX = Math.sqrt(a * a + b * b)) a /= scaleX, b /= scaleX;
		if (skewX = a * c + b * d) c -= a * skewX, d -= b * skewX;
		if (scaleY = Math.sqrt(c * c + d * d)) c /= scaleY, d /= scaleY, skewX /= scaleY;
		if (a * d < b * c) a = -a, b = -b, skewX = -skewX, scaleX = -scaleX;
		return {
			translateX: e,
			translateY: f,
			rotate: Math.atan2(b, a) * 180 / Math.PI,
			skewX: Math.atan(skewX) * 180 / Math.PI,
			scaleX: scaleX,
			scaleY: scaleY
		};
	},
});
