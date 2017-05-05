/**
 * @author Eberhard Graether / http://egraether.com/
 * @author Mark Lundin 	/ http://mark-lundin.com
 * @author Borja Díaz /
 */

import {
	Vector3 ,
	Vector2,
	Quaternion,
} from 'three';
import { EventDispatcher } from 'three/src/core/EventDispatcher';

export default class TrackballControls {
	//var STATE = { NONE: - 1, ROTATE: 0, ZOOM: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_ZOOM_PAN: 4 };
	STATE = { NONE: -1, ROTATE: 0, ZOOM: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_ZOOM: 4, TOUCH_PAN: 5 };

	object;
	domElement;

	// API
	enabled = true;
	screen = { left: 0, top: 0, width: 0, height: 0 };
	rotateSpeed = 1.0;
	zoomSpeed = 1.2;
	panSpeed = 0.3;
	noRotate = false;
	noZoom = false;
	noPan = false;
	staticMoving = false;
	dynamicDampingFactor = 0.2;
	minDistance = 0;
	maxDistance = Infinity;
	keys = [ 65 /*A*/, 83 /*S*/, 68 /*D*/ ];

	// internals
	EPS = 0.000001;
	target = new Vector3();
	lastPosition = new Vector3();
	state = this.STATE.NONE;
	prevState = this.STATE.NONE;
	eye = new Vector3();
	movePrev = new Vector2();
	moveCurr = new Vector2();
	lastAxis = new Vector3();
	lastAngle = 0;
	zoomStart = new Vector2();
	zoomEnd = new Vector2();
	touchZoomDistanceStart = 0;
	touchZoomDistanceEnd = 0;
	panStart = new Vector2();
	panEnd = new Vector2();

	// for reset
	target0;
	position0;
	up0;

	// events
	changeEvent = { type: 'change' };
	startEvent = { type: 'start'};
	endEvent = { type: 'end'};

	constructor( object, domElement ) {
		this.object = object;
		this.domElement = ( domElement !== undefined ) ? domElement : document;
		this.target0 = this.target.clone();
		this.position0 = this.object.position.clone();
		this.up0 = this.object.up.clone();
		this.ev = new EventDispatcher();

		this.domElement.addEventListener( 'contextmenu', function ( event ) { event.preventDefault(); }, false );
		this.domElement.addEventListener( 'mousedown', this.mousedown.bind(this), false );
		this.domElement.addEventListener( 'mousewheel', this.mousewheel.bind(this), false );
		this.domElement.addEventListener( 'DOMMouseScroll', this.mousewheel.bind(this), false ); // firefox
		this.domElement.addEventListener( 'touchstart', this.touchstart.bind(this), false );
		this.domElement.addEventListener( 'touchend', this.touchend.bind(this), false );
		this.domElement.addEventListener( 'touchmove', this.touchmove.bind(this), false );
		window.addEventListener( 'keydown', this.keydown.bind(this), false );
		window.addEventListener( 'keyup', this.keyup.bind(this), false );
		this.handleResize();
	}

	// methods
	handleResize() {
		if ( this.domElement === document ) {
			this.screen.left = 0;
			this.screen.top = 0;
			this.screen.width = window.innerWidth;
			this.screen.height = window.innerHeight;
		} else {
			let box = this.domElement.getBoundingClientRect();
			// adjustments come from similar code in the jquery offset() function
			let d = this.domElement.ownerDocument.documentElement;
			this.screen.left = box.left + window.pageXOffset - d.clientLeft;
			this.screen.top = box.top + window.pageYOffset - d.clientTop;
			this.screen.width = box.width;
			this.screen.height = box.height;
		}
	}
	handleEvent( event ) {
		if ( typeof this[ event.type ] == 'function' ) {
			this[ event.type ]( event );
		}
	}
	getMouseOnScreen() {
		let vector = new Vector2();
		let self = this;

		return function( pageX, pageY ) {
			vector.set(
				( pageX - self.screen.left ) / self.screen.width,
				( pageY - self.screen.top ) / self.screen.height
			);

			return vector;
		};
	}
	getMouseOnCircle() {
		let vector = new Vector2();
		let self = this;

		return function( pageX, pageY ) {
			vector.set(
				( ( pageX - self.screen.width * 0.5 - self.screen.left ) / ( self.screen.width * 0.5 ) ),
				( ( self.screen.height + 2 * ( self.screen.top - pageY ) ) / self.screen.width ) // screen.width intentional
			);

			return vector;
		};
	}
	rotateCamera(){
		let axis = new Vector3();
		let quaternion = new Quaternion();
		let eyeDirection = new Vector3();
		let objectUpDirection = new Vector3();
		let objectSidewaysDirection = new Vector3();
		let moveDirection = new Vector3();
		let angle;
		let self = this;

		return function() {
			moveDirection.set( self.moveCurr.x - self.movePrev.x, self.moveCurr.y - self.movePrev.y, 0 );
			angle = moveDirection.length();

			if ( angle ) {
				self.eye.copy( self.object.position ).sub( self.target );
				eyeDirection.copy( self.eye ).normalize();
				objectUpDirection.copy( self.object.up ).normalize();
				objectSidewaysDirection.crossVectors( objectUpDirection, eyeDirection ).normalize();
				objectUpDirection.setLength( self.moveCurr.y - self.movePrev.y );
				objectSidewaysDirection.setLength( self.moveCurr.x - self.movePrev.x );
				moveDirection.copy( objectUpDirection.add( objectSidewaysDirection ) );
				axis.crossVectors( moveDirection, self.eye ).normalize();
				angle *= self.rotateSpeed;
				quaternion.setFromAxisAngle( axis, angle );
				self.eye.applyQuaternion( quaternion );
				self.object.up.applyQuaternion( quaternion );
				self.lastAxis.copy( axis );
				self.lastAngle = angle;
			} else if ( ! self.staticMoving && self.lastAngle ) {
				self.lastAngle *= Math.sqrt( 1.0 - self.dynamicDampingFactor );
				self.eye.copy( self.object.position ).sub( self.target );
				quaternion.setFromAxisAngle( self.lastAxis, self.lastAngle );
				self.eye.applyQuaternion( quaternion );
				self.object.up.applyQuaternion( quaternion );
			}
			self.movePrev.copy( self.moveCurr );
		}
	}
	zoomCamera() {
		var factor;

		if ( this.state === this.STATE.TOUCH_ZOOM_PAN ) {
			factor = this.touchZoomDistanceStart / this.touchZoomDistanceEnd;
			this.touchZoomDistanceStart = this.touchZoomDistanceEnd;
			this.eye.multiplyScalar( factor );
		} else {
			factor = 1.0 + ( this.zoomEnd.y - this.zoomStart.y ) * this.zoomSpeed;
			if ( factor !== 1.0 && factor > 0.0 ) {
				this.eye.multiplyScalar( factor );
			}
			if ( this.staticMoving ) {
				this.zoomStart.copy( this.zoomEnd );
			} else {
				this.zoomStart.y += ( this.zoomEnd.y - this.zoomStart.y ) * this.dynamicDampingFactor;
			}
		}
	}
	panCamera() {
		let mouseChange = new Vector2();
	  let objectUp = new Vector3();
	  let pan = new Vector3();
		let self = this;

		return function panCamera() {
			mouseChange.copy( self.panEnd ).sub( self.panStart );
			if ( mouseChange.lengthSq() ) {
				mouseChange.multiplyScalar( self.eye.length() * self.panSpeed );
				pan.copy( self.eye ).cross( self.object.up ).setLength( mouseChange.x );
				pan.add( objectUp.copy( self.object.up ).setLength( mouseChange.y ) );
				self.object.position.add( pan );
				self.target.add( pan );
				if ( self.staticMoving ) {
					self.panStart.copy( self.panEnd );
				} else {
					self.panStart.add( mouseChange.subVectors( self.panEnd, self.panStart ).multiplyScalar( self.dynamicDampingFactor ) );
				}
			}
		}
	}
	checkDistances() {
		if ( ! this.noZoom || ! this.noPan ) {
			if ( this.eye.lengthSq() > this.maxDistance * this.maxDistance ) {
				this.object.position.addVectors( this.target, this.eye.setLength( this.maxDistance ) );
				this.zoomStart.copy( this.zoomEnd );
			}
			if ( this.eye.lengthSq() < this.minDistance * this.minDistance ) {
				this.object.position.addVectors( this.target, this.eye.setLength( this.minDistance ) );
				this.zoomStart.copy( this.zoomEnd );
			}
		}
	}
	update() {
		this.eye.subVectors( this.object.position, this.target );
		if ( !this.noRotate ) {
			this.rotateCamera()();
		}
		if ( !this.noZoom ) {
			this.zoomCamera();
		}
		if ( !this.noPan ) {
			this.panCamera()();
		}
		this.object.position.addVectors( this.target, this.eye );
		this.checkDistances();
		this.object.lookAt( this.target );
		if ( this.lastPosition.distanceToSquared( this.object.position ) > this.EPS ) {
			this.ev.dispatchEvent( this.changeEvent );
			this.lastPosition.copy( this.object.position );
		}
	}
	reset() {
		this.state = this.STATE.NONE;
		this.prevState = this.STATE.NONE;
		this.target.copy( this.target0 );
		this.object.position.copy( this.position0 );
		this.object.up.copy( this.up0 );
		this.eye.subVectors( this.object.position, this.target );
		this.object.lookAt( this.target );
		this.ev.dispatchEvent( this.changeEvent );
		lastPosition.copy( this.object.position );
	}

	// listeners
	keydown( event ) {
		if ( this.enabled === false ) return;
		window.removeEventListener( 'keydown', this.keydown );
		this.prevState = this.state;
		if ( this.state !== this.STATE.NONE ) {
			return;
		} else if ( event.keyCode === this.keys[ this.STATE.ROTATE ] && !this.noRotate ) {
			this.state = this.STATE.ROTATE;
		} else if ( event.keyCode === this.keys[ this.STATE.ZOOM ] && !this.noZoom ) {
			this.state = this.STATE.ZOOM;
		} else if ( event.keyCode === this.keys[ this.STATE.PAN ] && !this.noPan ) {
			this.state = this.STATE.PAN;
		}
	}
	keyup( event ) {
		if ( this.enabled === false ) return;
		this.state = this.prevState;
		window.addEventListener( 'keydown', this.keydown.bind(this), false );
	}
	mousedown( event ) {
		if ( this.enabled === false ) return;
		event.preventDefault();
		event.stopPropagation();
		if ( this.state === this.STATE.NONE ) {
			this.state = event.button;
		}
		if ( this.state === this.STATE.ROTATE && ! this.noRotate ) {
			this.moveCurr.copy( this.getMouseOnCircle()( event.pageX, event.pageY ) );
			this.movePrev.copy( this.moveCurr );
		} else if ( this.state === this.STATE.ZOOM && ! this.noZoom ) {
			this.zoomStart.copy( this.getMouseOnScreen()( event.pageX, event.pageY ) );
			this.zoomEnd.copy( this.zoomStart );
		} else if ( this.state === this.STATE.PAN && ! this.noPan ) {
			this.panStart.copy( this.getMouseOnScreen()( event.pageX, event.pageY ) );
			this.panEnd.copy( this.panStart );
		}

		document.addEventListener( 'mousemove', this.mousemove.bind(this), false );
		document.addEventListener( 'mouseup', this.mouseup.bind(this), false );
		this.ev.dispatchEvent( this.startEvent );
	}
	mousemove( event ) {
		if ( this.enabled === false ) return;
		event.preventDefault();
		event.stopPropagation();
		if ( this.state === this.STATE.ROTATE && ! this.noRotate ) {
			this.movePrev.copy( this.moveCurr );
			this.moveCurr.copy( this.getMouseOnCircle()( event.pageX, event.pageY ) );
		} else if ( this.state === this.STATE.ZOOM && ! this.noZoom ) {
			this.zoomEnd.copy( this.getMouseOnScreen()( event.pageX, event.pageY ) );
		} else if ( this.state === this.STATE.PAN && ! this.noPan ) {
			this.panEnd.copy( this.getMouseOnScreen()( event.pageX, event.pageY ) );
		}
	}
	mouseup( event ) {
		if ( this.enabled === false ) return;
		event.preventDefault();
		event.stopPropagation();
		this.state = this.STATE.NONE;
		document.removeEventListener( 'mousemove', this.mousemove );
		document.removeEventListener( 'mouseup', this.mouseup );
		this.ev.dispatchEvent( this.endEvent );
	}
	mousewheel( event ) {
		if ( this.enabled === false ) return;
		event.preventDefault();
		event.stopPropagation();
		switch ( event.deltaMode ) {
	    case 2:
	      // Zoom in pages
	      this.zoomStart.y -= event.deltaY * 0.025;
	      break;
			case 1:
        // Zoom in lines
				this.zoomStart.y -= event.deltaY * 0.01;
				break;
			default:
				// undefined, 0, assume pixels
				this.zoomStart.y -= event.deltaY * 0.00025;
				break;
		}

		this.ev.dispatchEvent( this.startEvent );
		this.ev.dispatchEvent( this.endEvent );
	}
	touchstart( event ) {
		if ( this.enabled === false ) return;
		switch ( event.touches.length ) {
			case 1:
				this.state = this.STATE.TOUCH_ROTATE;
				this.rotateEnd.copy( this.getMouseProjectionOnBall( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY, this.rotateStart ));
				break;
			case 2:
				this.state = this.STATE.TOUCH_ZOOM;
				var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
				var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
				this.touchZoomDistanceEnd = this.touchZoomDistanceStart = Math.sqrt( dx * dx + dy * dy );
				break;
			case 3:
				this.state = this.STATE.TOUCH_PAN;
				this.panEnd.copy( this.getMouseOnScreen( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY, this.panStart ));
				break;
			default:
				this.state = this.STATE.NONE;
		}
		this.ev.dispatchEvent( this.startEvent );
	}
	touchmove( event ) {
		if ( this.enabled === false ) return;
		event.preventDefault();
		event.stopPropagation();
		switch ( event.touches.length ) {
			case 1:
				this.getMouseProjectionOnBall( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY, this.rotateEnd );
				break;
			case 2:
				var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
				var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
				this.touchZoomDistanceEnd = Math.sqrt( dx * dx + dy * dy )
				break;
			case 3:
				this.getMouseOnScreen( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY, this.panEnd );
				break;
			default:
				this.state = this.STATE.NONE;
		}
	}
	touchend( event ) {
		if ( this.enabled === false ) return;
		switch ( event.touches.length ) {
			case 1:
				this.rotateStart.copy( this.getMouseProjectionOnBall( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY, this.rotateEnd ));
				break;
			case 2:
				this.touchZoomDistanceStart = this.touchZoomDistanceEnd = 0;
				break;
			case 3:
				this.panStart.copy( this.getMouseOnScreen( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY, this.panEnd ));
				break;
		}
		this.state = this.STATE.NONE;
		this.ev.dispatchEvent( this.endEvent );
	}
	addEventListener( type, listener ) {
		this.ev.addEventListener( type, listener );
	}
};
