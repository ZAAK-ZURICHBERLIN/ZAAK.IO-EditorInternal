/**
 * @author mrdoob / http://mrdoob.com/
 */
"use strict";
var Editor = function () {

	var SIGNALS = signals;

	this.DEFAULT_CAMERA = new THREE.PerspectiveCamera( 50, 1, 0.1, 10000 );
	this.DEFAULT_CAMERA.name = 'Camera';
	this.DEFAULT_CAMERA.position.set( 20, 10, 20 );
	this.DEFAULT_CAMERA.lookAt( new THREE.Vector3() );

	this.signals = {

		// script

		editScript: new SIGNALS.Signal(),

		// player

		startPlayer: new SIGNALS.Signal(),
		stopPlayer: new SIGNALS.Signal(),

		// actions

		showModal: new SIGNALS.Signal(),

		// notifications

		editorCleared: new SIGNALS.Signal(),

		savingStarted: new SIGNALS.Signal(),
		savingFinished: new SIGNALS.Signal(),

		themeChanged: new SIGNALS.Signal(),

		transformModeChanged: new SIGNALS.Signal(),
		snapChanged: new SIGNALS.Signal(),
		spaceChanged: new SIGNALS.Signal(),
		rendererChanged: new SIGNALS.Signal(),

		sceneGraphChanged: new SIGNALS.Signal(),

		cameraChanged: new SIGNALS.Signal(),

		geometryChanged: new SIGNALS.Signal(),

		objectSelected: new SIGNALS.Signal(),
		objectFocused: new SIGNALS.Signal(),

		objectAdded: new SIGNALS.Signal(),
		objectChanged: new SIGNALS.Signal(),
		objectRemoved: new SIGNALS.Signal(),

		helperAdded: new SIGNALS.Signal(),
		helperRemoved: new SIGNALS.Signal(),

		materialChanged: new SIGNALS.Signal(),

		scriptAdded: new SIGNALS.Signal(),
		scriptChanged: new SIGNALS.Signal(),
		scriptRemoved: new SIGNALS.Signal(),

		fogTypeChanged: new SIGNALS.Signal(),
		fogColorChanged: new SIGNALS.Signal(),
		fogParametersChanged: new SIGNALS.Signal(),
		windowResize: new SIGNALS.Signal(),

		showGridChanged: new SIGNALS.Signal(),
		refreshSidebarObject3D: new SIGNALS.Signal(),
		historyChanged: new SIGNALS.Signal(),
		refreshScriptEditor: new SIGNALS.Signal(),

		cameraPositionSnap: new SIGNALS.Signal(),
		undo: new SIGNALS.Signal(),
		redo: new SIGNALS.Signal(),
		switchCameraMode: new SIGNALS.Signal(),
		unsaveProject: new SIGNALS.Signal(),
		saveProject: new SIGNALS.Signal(),
		showManChanged: new SIGNALS.Signal(),

		bgColorChanged: new SIGNALS.Signal(),
		presetChanged: new SIGNALS.Signal()

	};

	this.config = new Config();
	this.history = new History( this );
	this.storage = new Storage();
	this.loader = new Loader( this );

	this.camera = this.DEFAULT_CAMERA.clone();
	this.camera.aspect = this.DEFAULT_CAMERA.aspect;
 	this.camera.updateProjectionMatrix();

	// this.camera = new THREE.CombinedCamera( window.innerWidth / 2, window.innerHeight / 2, 70, 1, 1000, - 500, 1000 );
	// this.camera.name = 'ComboCamera';//'Camera';
	// this.camera.position.set( 20, 10, 20 );
	// this.camera.lookAt( new THREE.Vector3() );

	this.scene = new THREE.Scene();
	this.scene.name = 'Scene';

	this.sceneHelpers = new THREE.Scene();

	this.object = {};
	this.geometries = {};
	this.materials = {};
	// this.textures = {};
	this.scripts = {};

	this.selected = null;
	this.helpers = {};

	this.shortcuts = new EditorShortCutsList();
	this.isolationMode = false;

	this.sidebarObject = null;
	this.sidebarProject = null;


	var SCREEN_WIDTH = window.innerWidth;
	var SCREEN_HEIGHT = window.innerHeight;


	var activeCamera;
	var cameraPerspective, cameraOrtho;
	this.renderer = null;

	this.RenderFcts = [];

};

Editor.prototype = {

	setTheme: function ( value ) {

		//document.getElementById( 'theme' ).href = value;

		this.signals.themeChanged.dispatch( value );

	},

	//

	setScene: function ( scene ) {

		this.scene.uuid = scene.uuid;
		this.scene.name = scene.name;
		this.scene.userData = JSON.parse( JSON.stringify( scene.userData ) );

		// avoid render per object

		this.signals.sceneGraphChanged.active = false;

		while ( scene.children.length > 0 ) {

			this.addObject( scene.children[ 0 ] );

		}
		// console.log("why");
		this.signals.sceneGraphChanged.active = true;
		this.signals.sceneGraphChanged.dispatch();

	},

	//

	addObject: function ( object ) {

		var scope = this;

		object.traverse( function ( child ) {

			if ( child.geometry !== undefined ) scope.addGeometry( child.geometry );
			if ( child.material !== undefined ) scope.addMaterial( child.material );

			scope.addHelper( child );

		} );

		this.scene.add( object );

		this.signals.objectAdded.dispatch( object );
		this.signals.sceneGraphChanged.dispatch();

	},

	cloneObject: function(){

		var object = this.selected;

		if( object === null ) return;

		if ( object.parent === undefined ) return; // avoid cloning the camera or scene

		object = object.clone();

		this.addObject( object );
		this.select( object );
	},

	destoryCurrent: function(){

		var object = this.selected;

		if(object === null) return;

		if ( confirm( 'Delete ' + object.name + '?' ) === false ) return;

		var parent = object.parent;
		this.removeObject( object );
		this.select( null );
	},

	moveObject: function ( object, parent, before ) {

		if ( parent === undefined ) {

			parent = this.scene;

		}

		parent.add( object );

		// sort children array

		if ( before !== undefined ) {

			var index = parent.children.indexOf( before );
			parent.children.splice( index, 0, object );
			parent.children.pop();

		}

		this.signals.sceneGraphChanged.dispatch();

	},

	nameObject: function ( object, name ) {

		object.name = name;
		this.signals.sceneGraphChanged.dispatch();

	},

	removeObject: function ( object ) {

		if ( object.parent === null ) return; // avoid deleting the camera or scene

		var scope = this;

		object.traverse( function ( child ) {

			scope.removeHelper( child );

		} );

		object.parent.remove( object );

		this.signals.objectRemoved.dispatch( object );
		this.signals.sceneGraphChanged.dispatch();

	},

	addGeometry: function ( geometry ) {

		this.geometries[ geometry.uuid ] = geometry;

	},

	setGeometryName: function ( geometry, name ) {

		geometry.name = name;
		this.signals.sceneGraphChanged.dispatch();

	},

	addMaterial: function ( material ) {

		this.materials[ material.uuid ] = material;

	},

	setMaterialName: function ( material, name ) {

		material.name = name;
		this.signals.sceneGraphChanged.dispatch();

	},

	addTexture: function ( texture ) {

		this.textures[ texture.uuid ] = texture;

	},

	//

	addHelper: function () {

		var geometry = new THREE.SphereBufferGeometry( 2, 4, 2 );
		var material = new THREE.MeshBasicMaterial( { color: 0xff0000, visible: false } );

		return function ( object ) {

			var helper;

			if ( object instanceof THREE.Camera ) {

				helper = new THREE.CameraHelper( object, 1 );

			} else if ( object instanceof THREE.PointLight ) {

				helper = new THREE.PointLightHelper( object, 1 );

			} else if ( object instanceof THREE.DirectionalLight ) {

				helper = new THREE.DirectionalLightHelper( object, 1 );

			} else if ( object instanceof THREE.SpotLight ) {

				helper = new THREE.SpotLightHelper( object, 1 );

			} else if ( object instanceof THREE.HemisphereLight ) {

				helper = new THREE.HemisphereLightHelper( object, 1 );

			} else if ( object instanceof THREE.SkinnedMesh ) {

				helper = new THREE.SkeletonHelper( object );

			} else {

				// no helper for this object type
				return;

			}

			var picker = new THREE.Mesh( geometry, material );
			picker.name = 'picker';
			picker.userData.object = object;
			helper.add( picker );

			this.sceneHelpers.add( helper );
			this.helpers[ object.id ] = helper;

			this.signals.helperAdded.dispatch( helper );

		};

	}(),

	removeHelper: function ( object ) {

		if ( this.helpers[ object.id ] !== undefined ) {

			var helper = this.helpers[ object.id ];
			helper.parent.remove( helper );

			delete this.helpers[ object.id ];

			this.signals.helperRemoved.dispatch( helper );

		}

	},

	//
	addScriptNew: function ( _script ) {

		editor.execute( new AddScriptCommand( this.selected, _script ) );


	},

	addScript: function ( object, script ) {

		if ( this.scripts[ object.uuid ] === undefined ) {

			this.scripts[ object.uuid ] = [];

		}

		this.scripts[ object.uuid ].push( script );

		this.signals.scriptAdded.dispatch( script );

	},

	removeScript: function ( object, script ) {

		if ( this.scripts[ object.uuid ] === undefined ) return;

		var index = this.scripts[ object.uuid ].indexOf( script );

		if ( index !== - 1 ) {

			this.scripts[ object.uuid ].splice( index, 1 );

		}

		this.signals.scriptRemoved.dispatch( script );

	},

	//

	select: function ( object ) {

		if ( this.selected === object ) return;

		var uuid = null;

		if ( object !== null ) {

			uuid = object.uuid;

		}

		this.selected = object;

		this.config.setKey( 'selected', uuid );
		this.signals.objectSelected.dispatch( object );

	},

	selectById: function ( id ) {

		if ( id === this.camera.id ) {

			this.select( this.camera );
			return;

		}

		this.select( this.scene.getObjectById( id, true ) );

	},

	selectByUuid: function ( uuid ) {

		var scope = this;

		this.scene.traverse( function ( child ) {

			if ( child.uuid === uuid ) {

				scope.select( child );

			}

		} );

	},

	deselect: function () {

		this.select( null );

	},

	focus: function ( object ) {

		if ( this.selected === null ) return;
			this.signals.objectFocused.dispatch( object );

		this.cleanScene(this.scene);	

	},

	focusById: function ( id ) {

		this.focus( this.scene.getObjectById( id, true ) );

	},


	hide: function(){

		if(this.selected !== null){
			this.selected.visible = false;
			this.deselect();
		}
	},

	unhideAll: function(){

		this.scene.traverse( function ( child ) {

			child.visible = true;

		} );

		this.signals.sceneGraphChanged.dispatch();
	},

	isolate: function(){

		var mode = !this.isolationMode;
		this.isolationMode = mode;

		if(this.selected !== null){
			this.scene.traverse( function ( child ) {

				if ( !(child instanceof THREE.Light )){ 
					if(child.name !== "Scene" ){
					
						child.visible = mode;

					}
				}
			} );

			this.selected.visible = true;

			//TODO: Add parent iteration so all parents of an object stay visible and don't hide the child
			this.signals.sceneGraphChanged.dispatch();

		}
	},

	clear: function () {

		this.history.clear();
		this.storage.clear();

		this.camera.copy( this.DEFAULT_CAMERA );

		var objects = this.scene.children;

		while ( objects.length > 0 ) {

			this.removeObject( objects[ 0 ] );

		}

		this.geometries = {};
		this.materials = {};
		this.textures = {};
		this.scripts = {};

		this.deselect();

		this.signals.editorCleared.dispatch();

	},

	//

	fromJSON: function ( json ) {

		console.log(json);

		var loader = new THREE.ObjectLoader();

		// backwards

		if ( json.scene === undefined ) {

			this.setScene( loader.parse( json ) );
			return;

		}

		// TODO: Clean this up somehow

		if ( json.project !== undefined ) {

			this.config.setKey( 'project/renderer/shadows', json.project.shadows );
			this.config.setKey( 'project/vr', json.project.vr );
			this.config.setKey('backgroundColor', json.project.backgroundColor);

			this.signals.bgColorChanged.dispatch( json.project.backgroundColor );

			console.log("project");
		}
		// console.log(this.config.getKey('backgroundColor'));

		// this.signals.bgColorChanged.dispatch( this.config.getKey('backgroundColor'));


		var camera = loader.parse( json.camera );

		this.camera.copy( camera );
		this.history.fromJSON( json.history );
		this.scripts = json.scripts;

		console.log(json.scene);

		this.setScene( loader.parse( json.scene ) );

		this.signals.saveProject.dispatch();

		console.log("hw");

	},

	toJSON: function () {

		// scripts clean up
		var scene = this.scene;
		var scripts = this.scripts;

		for ( var key in scripts ) {

			var script = scripts[ key ];

			if ( script.length === 0 || scene.getObjectByProperty( 'uuid', key ) === undefined ) {

				delete scripts[ key ];

			}

		}
		//Script merging;
		// var array = [{name:"foo1",value:"val1"},{name:"foo1",value:["val2","val3"]},{name:"foo2",value:"val4"}];

		// var output = [];

		// for ( var value in scripts ) { 
		//     var existing = output.filter(function(v, i) { 
		//         return v.name == value.name; 
		//     }); 
		//     if(existing.length) {
		//         var existingIndex = output.indexOf(existing[0]);
		//         output[existingIndex].value = output[existingIndex].value.concat(value.value); 
		//     }
		//     else {
		//         if(typeof value.value == 'string')
		//             value.value = [value.value];
		//         output.push(value);  
		//     }
		// }

		// console.dir(output);

		//

		return {

			metadata: {},
			project: {
				shadows: this.config.getKey( 'project/renderer/shadows' ),
				vr: this.config.getKey( 'project/vr' ),
				backgroundColor: this.config.getKey('backgroundColor'),
				fog: this.scene.fog,
				fogColor: this.config.getKey('fogColor')
			},
			camera: this.camera.toJSON(),
			scene: this.scene.toJSON(),
			scripts: this.scripts,
			history: this.history.toJSON()

		};

	},

	cleanScene: function ( _scene ){

		// console.log(_scene.toJSON());

	},

	objectByUuid: function ( uuid ) {

		return this.scene.getObjectByProperty( 'uuid', uuid, true );

	},

	execute: function ( cmd, optionalName ) {

		this.history.execute( cmd, optionalName );

	},

	undo: function () {

		this.history.undo();

	},

	redo: function () {

		this.history.redo();

	}

};
